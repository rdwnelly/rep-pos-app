import { useState, useCallback, useRef, useEffect } from 'react';

// Nama target printer thermal mobile
const TARGET_PRINTER_NAME = 'RPP02N';

// UUID service printer thermal ESC/POS (common untuk berbagai merek)
const PRINTER_SERVICE_UUIDS = [
    '000018f0-0000-1000-8000-00805f9b34fb', // Standard ESC/POS
    'e7810a71-73ae-499d-8c15-faa9aef0c3f2', // Mini thermal
    '0000ff00-0000-1000-8000-00805f9b34fb', // Common Chinese BLE printers (FFxx series)
    '0000ffe0-0000-1000-8000-00805f9b34fb', // HM-10 UART module (banyak dipakai KZ-58BT dll)
    '0000ae00-0000-1000-8000-00805f9b34fb', // Alternate thermal printer service
    '49535343-fe7d-4ae5-8fa9-9fafd205e455', // ISSC/Microchip BLE UART
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
        // Strategi 1: Coba setiap UUID service yang diketahui satu per satu
        for (const uuid of PRINTER_SERVICE_UUIDS) {
            try {
                const service = await server.getPrimaryService(uuid);
                console.log('[BT Printer] Ditemukan service:', uuid);
                const characteristics = await service.getCharacteristics();
                for (const characteristic of characteristics) {
                    console.log('[BT Printer] Characteristic:', characteristic.uuid, 
                        'write:', characteristic.properties.write,
                        'writeWithoutResponse:', characteristic.properties.writeWithoutResponse);
                    if (characteristic.properties.write || characteristic.properties.writeWithoutResponse) {
                        console.log('[BT Printer] Menggunakan characteristic:', characteristic.uuid);
                        return characteristic;
                    }
                }
            } catch {
                // Service UUID ini tidak tersedia pada printer ini, lanjut ke berikutnya
            }
        }

        // Strategi 2: Fallback — ambil semua service yang tersedia
        try {
            const services = await server.getPrimaryServices();
            console.log('[BT Printer] Fallback: ditemukan', services.length, 'service(s)');
            for (const service of services) {
                console.log('[BT Printer] Service UUID:', service.uuid);
                const characteristics = await service.getCharacteristics();
                for (const characteristic of characteristics) {
                    if (characteristic.properties.write || characteristic.properties.writeWithoutResponse) {
                        console.log('[BT Printer] Fallback — menggunakan characteristic:', characteristic.uuid, 'dari service:', service.uuid);
                        return characteristic;
                    }
                }
            }
        } catch (e) {
            console.error('[BT Printer] Gagal getPrimaryServices():', e);
        }

        throw new Error('Tidak menemukan karakteristik write pada printer ini. Pastikan printer mendukung BLE.');
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
    // Jika tidak ada dan silentOnly === false, baru requestDevice() dengan filter nama RPP02N
    const connect = useCallback(async (options?: { silentOnly?: boolean }): Promise<boolean> => {
        const silentOnly = options?.silentOnly ?? false;

        // Fast path: jika sudah terhubung dan characteristic siap, kembalikan true langsung
        if (deviceRef.current?.gatt?.connected && characteristicRef.current) {
            setIsConnected(true);
            setStatus('connected');
            return true;
        }

        if (!isBluetoothSupported()) {
            setStatus('error');
            setErrorMessage('Web Bluetooth tidak aktif di browser/koneksi ini. Gunakan Chrome/Edge via HTTPS atau http://localhost.');
            if (!silentOnly) throw new Error('Web Bluetooth tidak didukung pada browser/koneksi ini.');
            return false;
        }

        // Cek apakah Bluetooth hardware aktif
        try {
            const available = await getBluetooth().getAvailability?.();
            if (available === false) {
                setStatus('bt_off');
                setErrorMessage('Bluetooth tidak aktif. Nyalakan Bluetooth di HP / Komputer Anda.');
                if (!silentOnly) throw new Error('Bluetooth hardware tidak aktif.');
                return false;
            }
        } catch (e: any) {
            if (e.message?.includes('Bluetooth tidak aktif')) {
                if (!silentOnly) throw e;
                return false;
            }
            // getAvailability tidak tersedia di semua browser, lanjutkan
        }

        setStatus('connecting');
        setErrorMessage(null);

        try {
            let device: any = null;

            // Langkah 1: Cek apakah ada deviceRef yang tersimpan di memory
            if (deviceRef.current) {
                device = deviceRef.current;
            }

            // Langkah 2: Coba ambil perangkat yang sudah dipilih sebelumnya (tanpa dialog)
            if (!device && getBluetooth().getDevices) {
                const savedId = localStorage.getItem(STORAGE_KEY);
                const pairedDevices: any[] = await getBluetooth().getDevices();
                if (savedId) {
                    device = pairedDevices.find((d: any) => d.id === savedId) || null;
                }
                if (!device && pairedDevices.length > 0) {
                    device = pairedDevices.find((d: any) => d.name === TARGET_PRINTER_NAME) || pairedDevices[0];
                }
            }

            // Langkah 3: Kalau belum ada dan BUKAN mode silent, tampilkan dialog pemilihan printer
            if (!device && !silentOnly) {
                // Gunakan acceptAllDevices agar SEMUA printer bluetooth muncul di dialog
                device = await getBluetooth().requestDevice({
                    acceptAllDevices: true,
                    optionalServices: PRINTER_SERVICE_UUIDS,
                });

                if (device) {
                    // Simpan ID device agar bisa reconnect otomatis berikutnya
                    localStorage.setItem(STORAGE_KEY, device.id);
                }
            }

            if (!device) {
                setStatus('disconnected');
                if (!silentOnly) throw new Error('Tidak ada perangkat printer Bluetooth yang dipilih.');
                return false;
            }

            // Koneksi ke GATT
            device.removeEventListener('gattserverdisconnected', handleDisconnected);
            device.addEventListener('gattserverdisconnected', handleDisconnected);
            const server = await device.gatt?.connect();
            if (!server) throw new Error('Gagal terhubung ke GATT Server printer.');

            // Beri jeda 300ms agar GATT server RPP02N stabil sebelum setup characteristic
            await new Promise(resolve => setTimeout(resolve, 300));

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

            setStatus('disconnected');
            setErrorMessage(error.message || 'Gagal terhubung ke printer Bluetooth.');
            if (!silentOnly) throw error;
            return false;
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
        // Cek characteristicRef saja (bukan isConnected state yang bisa belum ter-update).
        // characteristicRef.current sudah di-set langsung oleh connect() via ref,
        // sedangkan isConnected adalah React state yang update-nya asinkron.
        if (!characteristicRef.current) {
            throw new Error('Printer tidak terhubung. Sambungkan printer terlebih dahulu.');
        }

        console.log('[BT Printer] Mulai cetak, total bytes:', data.length);
        console.log('[BT Printer] Characteristic:', characteristicRef.current.uuid,
            'write:', characteristicRef.current.properties.write,
            'writeWithoutResponse:', characteristicRef.current.properties.writeWithoutResponse);

        // Chunk size kecil (20 bytes) lebih aman untuk printer BLE murah
        // Beberapa printer (KZ-58BT dll) tidak bisa menerima chunk besar
        const maxChunk = 20;
        let offset = 0;
        let chunkIndex = 0;

        while (offset < data.length) {
            const end = Math.min(offset + maxChunk, data.length);
            const chunk = data.slice(offset, end);

            try {
                if (characteristicRef.current.properties.writeWithoutResponse) {
                    await characteristicRef.current.writeValueWithoutResponse(chunk);
                } else {
                    await characteristicRef.current.writeValue(chunk);
                }
            } catch (err) {
                console.error(`[BT Printer] Gagal kirim chunk ${chunkIndex} (offset ${offset}):`, err);
                throw err;
            }

            offset = end;
            chunkIndex++;
            // Delay 50ms antar chunk — beberapa printer BLE butuh waktu proses
            await new Promise(resolve => setTimeout(resolve, 50));
        }

        console.log('[BT Printer] Selesai cetak,', chunkIndex, 'chunk(s) terkirim.');
        return true;
    }, []);

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
