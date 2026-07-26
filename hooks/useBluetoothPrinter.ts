import { useState, useCallback, useRef, useEffect } from 'react';

// Nama target printer thermal mobile
const TARGET_PRINTER_NAME = 'RPP02N';

// UUID service printer thermal ESC/POS (common)
const PRINTER_SERVICE_UUIDS = [
    '000018f0-0000-1000-8000-00805f9b34fb', // Standard ESC/POS
    'e7810a71-73ae-499d-8c15-faa9aef0c3f2', // Mini thermal
];

// Key untuk menyimpan perangkat yang sudah terpilih
const STORAGE_KEY = 'bt_printer_paired';

export type BluetoothStatus = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error' | 'bt_off';

export const useBluetoothPrinter = () => {
    const [status, setStatus] = useState<BluetoothStatus>('idle');
    const [isConnected, setIsConnected] = useState(false);
    const [deviceName, setDeviceName] = useState<string | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const deviceRef = useRef<any | null>(null);
    const characteristicRef = useRef<any | null>(null);
    const autoReconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const getBluetooth = () => (navigator as any).bluetooth;
    const isBluetoothSupported = () => !!getBluetooth();

    // --- Disconnect ---
    const disconnect = useCallback(() => {
        if (autoReconnectTimerRef.current) clearTimeout(autoReconnectTimerRef.current);
        if (deviceRef.current?.gatt?.connected) {
            deviceRef.current.gatt.disconnect();
        }
        deviceRef.current = null;
        characteristicRef.current = null;
        setIsConnected(false);
        setDeviceName(null);
        setStatus('disconnected');
    }, []);

    // --- Ambil karakteristik dari GATT server ---
    const setupCharacteristic = async (server: any): Promise<any> => {
        const services = await server.getPrimaryServices();
        for (const service of services) {
            const characteristics = await service.getCharacteristics();
            for (const characteristic of characteristics) {
                if (characteristic.properties.write || characteristic.properties.writeWithoutResponse) {
                    return characteristic;
                }
            }
        }
        throw new Error('Tidak menemukan karakteristik write pada printer ini.');
    };

    // --- Auto-reconnect handler saat terputus ---
    const handleDisconnected = useCallback(async () => {
        setIsConnected(false);
        setDeviceName(null);
        characteristicRef.current = null;
        setStatus('disconnected');

        // Coba reconnect otomatis ke device yang sama (tanpa dialog)
        const device = deviceRef.current;
        if (device) {
            autoReconnectTimerRef.current = setTimeout(async () => {
                try {
                    setStatus('connecting');
                    const server = await device.gatt?.connect();
                    if (server) {
                        const characteristic = await setupCharacteristic(server);
                        characteristicRef.current = characteristic;
                        setDeviceName(device.name || TARGET_PRINTER_NAME);
                        setIsConnected(true);
                        setStatus('connected');
                        setErrorMessage(null);
                    }
                } catch {
                    setStatus('disconnected');
                }
            }, 3000); // coba reconnect setelah 3 detik
        }
    }, []);

    // --- Connect ke printer ---
    // Pertama coba getDevices() (tanpa dialog) untuk device yang sudah pernah dipilih
    // Jika tidak ada, baru requestDevice() dengan filter nama RPP02N
    const connect = useCallback(async (): Promise<boolean> => {
        if (!isBluetoothSupported()) {
            setStatus('error');
            setErrorMessage('Web Bluetooth tidak didukung. Gunakan Chrome/Edge di Android atau Desktop.');
            throw new Error('Web Bluetooth tidak didukung.');
        }

        // Cek apakah Bluetooth hardware aktif
        try {
            const available = await getBluetooth().getAvailability?.();
            if (available === false) {
                setStatus('bt_off');
                setErrorMessage('Bluetooth tidak aktif. Nyalakan Bluetooth terlebih dahulu.');
                throw new Error('Bluetooth tidak aktif.');
            }
        } catch (e: any) {
            if (e.message?.includes('Bluetooth tidak aktif')) throw e;
            // getAvailability tidak tersedia di semua browser, lanjutkan
        }

        setStatus('connecting');
        setErrorMessage(null);

        try {
            let device: any = null;

            // Langkah 1: Coba ambil perangkat yang sudah dipilih sebelumnya (tanpa dialog)
            if (getBluetooth().getDevices) {
                const pairedDevices: any[] = await getBluetooth().getDevices();
                device = pairedDevices.find((d: any) =>
                    d.name === TARGET_PRINTER_NAME || d.id === localStorage.getItem(STORAGE_KEY)
                ) || null;
            }

            // Langkah 2: Kalau belum ada, tampilkan dialog SEKALI saja dengan filter nama RPP02N
            if (!device) {
                device = await getBluetooth().requestDevice({
                    filters: [{ name: TARGET_PRINTER_NAME }],
                    optionalServices: PRINTER_SERVICE_UUIDS,
                }).catch(async () => {
                    // Fallback: filter by services kalau nama tidak ditemukan
                    return await getBluetooth().requestDevice({
                        filters: [{ services: PRINTER_SERVICE_UUIDS }],
                        optionalServices: PRINTER_SERVICE_UUIDS,
                    });
                });

                if (device) {
                    // Simpan ID device agar bisa reconnect otomatis berikutnya
                    localStorage.setItem(STORAGE_KEY, device.id);
                }
            }

            if (!device) {
                throw new Error('Tidak ada perangkat yang dipilih.');
            }

            // Koneksi ke GATT
            device.addEventListener('gattserverdisconnected', handleDisconnected);
            const server = await device.gatt?.connect();
            if (!server) throw new Error('Gagal terhubung ke GATT Server.');

            const characteristic = await setupCharacteristic(server);

            deviceRef.current = device;
            characteristicRef.current = characteristic;
            setDeviceName(device.name || TARGET_PRINTER_NAME);
            setIsConnected(true);
            setStatus('connected');
            setErrorMessage(null);
            return true;

        } catch (error: any) {
            // Jika user membatalkan dialog (NotFoundError / cancelled)
            if (error.name === 'NotFoundError' || error.message?.includes('cancelled') || error.message?.includes('User cancelled')) {
                setStatus('idle');
                setErrorMessage(null);
                return false;
            }

            setStatus('error');
            setErrorMessage(error.message || 'Gagal terhubung ke printer.');
            throw error;
        }
    }, [handleDisconnected]);

    // --- Auto-connect saat hook pertama kali dimuat ---
    // Coba reconnect ke printer yang sudah pernah dipilih (tanpa dialog)
    useEffect(() => {
        const tryAutoConnect = async () => {
            if (!isBluetoothSupported()) return;
            if (!getBluetooth().getDevices) return;

            const savedId = localStorage.getItem(STORAGE_KEY);
            if (!savedId) return;

            try {
                const pairedDevices: any[] = await getBluetooth().getDevices();
                const device = pairedDevices.find((d: any) => d.id === savedId || d.name === TARGET_PRINTER_NAME);
                if (!device) return;

                setStatus('connecting');
                device.addEventListener('gattserverdisconnected', handleDisconnected);

                const server = await device.gatt?.connect();
                if (!server) return;

                const characteristic = await setupCharacteristic(server);
                deviceRef.current = device;
                characteristicRef.current = characteristic;
                setDeviceName(device.name || TARGET_PRINTER_NAME);
                setIsConnected(true);
                setStatus('connected');
                setErrorMessage(null);
            } catch {
                // Auto-connect gagal, tidak perlu notifikasi — printer mungkin belum menyala
                setStatus('idle');
            }
        };

        tryAutoConnect();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // --- Print ---
    const print = useCallback(async (data: Uint8Array): Promise<boolean> => {
        if (!characteristicRef.current || !isConnected) {
            // Coba reconnect otomatis sebelum print
            await connect();
            if (!characteristicRef.current) {
                throw new Error('Printer tidak terhubung.');
            }
        }

        const maxChunk = 100;
        let offset = 0;

        while (offset < data.length) {
            const end = Math.min(offset + maxChunk, data.length);
            const chunk = data.slice(offset, end);

            if (characteristicRef.current.properties.writeWithoutResponse) {
                await characteristicRef.current.writeValueWithoutResponse(chunk);
            } else {
                await characteristicRef.current.writeValue(chunk);
            }

            offset = end;
            await new Promise(resolve => setTimeout(resolve, 20));
        }

        return true;
    }, [isConnected, connect]);

    return {
        isConnected,
        status,
        deviceName,
        errorMessage,
        connect,
        disconnect,
        print,
    };
};
