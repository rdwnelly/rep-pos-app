import { useState, useCallback, useRef } from 'react';

// Common Bluetooth Printer UUIDs
const PRINTER_SERVICE_UUIDS = [
  '000018f0-0000-1000-8000-00805f9b34fb', // Standard ESC/POS
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2', // Mini thermal
];

export const useBluetoothPrinter = () => {
    const [isConnected, setIsConnected] = useState(false);
    const [deviceName, setDeviceName] = useState<string | null>(null);
    const deviceRef = useRef<any | null>(null);
    const characteristicRef = useRef<any | null>(null);

    const disconnect = useCallback(() => {
        if (deviceRef.current && deviceRef.current.gatt?.connected) {
            deviceRef.current.gatt.disconnect();
        }
        deviceRef.current = null;
        characteristicRef.current = null;
        setIsConnected(false);
        setDeviceName(null);
    }, []);

    const handleDisconnected = useCallback(() => {
        setIsConnected(false);
        setDeviceName(null);
        characteristicRef.current = null;
        deviceRef.current = null;
        console.log('Bluetooth Printer disconnected');
    }, []);

    const connect = useCallback(async () => {
        try {
            if (!(navigator as any).bluetooth) {
                throw new Error("Web Bluetooth API tidak didukung di browser ini. Gunakan Chrome/Edge di Desktop atau Android.");
            }

            console.log('Requesting Bluetooth Device...');
            const device = await (navigator as any).bluetooth.requestDevice({
                filters: [
                    { services: PRINTER_SERVICE_UUIDS }
                ],
                optionalServices: [
                    '000018f0-0000-1000-8000-00805f9b34fb',
                    'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
                    '00001800-0000-1000-8000-00805f9b34fb' // Generic access
                ],
                // acceptAllDevices: true // if filters don't work, we can fallback to acceptAllDevices
            }).catch(async (e) => {
                // Fallback to accept all if specific filters fail (some cheap printers don't advertise correctly)
                console.log('Fallback to acceptAllDevices', e);
                return await (navigator as any).bluetooth.requestDevice({
                    acceptAllDevices: true,
                    optionalServices: PRINTER_SERVICE_UUIDS
                });
            });

            if (!device) {
                throw new Error("Tidak ada perangkat yang dipilih.");
            }

            console.log('Connecting to GATT Server...');
            device.addEventListener('gattserverdisconnected', handleDisconnected);
            const server = await device.gatt?.connect();

            if (!server) {
                throw new Error("Gagal terhubung ke GATT Server.");
            }

            console.log('Getting Services...');
            const services = await server.getPrimaryServices();
            let printerCharacteristic: any | null = null;

            for (const service of services) {
                console.log('> Service: ' + service.uuid);
                const characteristics = await service.getCharacteristics();
                for (const characteristic of characteristics) {
                    console.log('>> Characteristic: ' + characteristic.uuid + ' ' +
                                (characteristic.properties.write ? 'WRITE ' : '') +
                                (characteristic.properties.writeWithoutResponse ? 'WRITE_WITHOUT_RESPONSE' : ''));
                    if (characteristic.properties.write || characteristic.properties.writeWithoutResponse) {
                        printerCharacteristic = characteristic;
                        break;
                    }
                }
                if (printerCharacteristic) break;
            }

            if (!printerCharacteristic) {
                throw new Error("Tidak menemukan karakteristik untuk menulis (print) pada perangkat ini.");
            }

            deviceRef.current = device;
            characteristicRef.current = printerCharacteristic;
            setDeviceName(device.name || 'Printer Bluetooth');
            setIsConnected(true);
            console.log('Berhasil terhubung ke printer!');
            return true;

        } catch (error: any) {
            console.error('Bluetooth Connect Error:', error);
            throw error;
        }
    }, [handleDisconnected]);

    const print = useCallback(async (data: Uint8Array) => {
        if (!characteristicRef.current) {
            throw new Error("Printer tidak terhubung.");
        }

        const maxChunk = 512; // BLE characteristic max write size is often small (usually around 20-512)
        let offset = 0;

        console.log(`Printing ${data.length} bytes...`);
        try {
            while (offset < data.length) {
                const end = Math.min(offset + maxChunk, data.length);
                const chunk = data.slice(offset, end);
                
                if (characteristicRef.current.properties.writeWithoutResponse) {
                     await characteristicRef.current.writeValueWithoutResponse(chunk);
                } else {
                     await characteristicRef.current.writeValue(chunk);
                }
                
                offset = end;
                // Small delay to prevent overwhelming some slow printers
                await new Promise(resolve => setTimeout(resolve, 10));
            }
            console.log('Print selesai.');
            return true;
        } catch (error) {
            console.error('Print failed:', error);
            throw error;
        }
    }, []);

    return {
        isConnected,
        deviceName,
        connect,
        disconnect,
        print
    };
};
