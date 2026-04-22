
import React, { useState, useEffect } from 'react';
import { Bluetooth, BluetoothOff, Loader2, Link, Unlink, AlertCircle } from 'lucide-react';

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected';

const BluetoothConnect: React.FC = () => {
    const [status, setStatus] = useState<ConnectionStatus>('disconnected');
    const [device, setDevice] = useState<BluetoothDevice | null>(null);
    const [server, setServer] = useState<BluetoothRemoteGATTServer | null>(null);
    const [error, setError] = useState<string | null>(null);

    const handleConnect = async () => {
        if (!navigator.bluetooth) {
            setError('Web Bluetooth API não suportada neste navegador.');
            return;
        }

        try {
            setStatus('connecting');
            setError(null);

            console.log('[Bluetooth] Iniciando busca por dispositivos...');
            const device = await navigator.bluetooth.requestDevice({
                acceptAllDevices: true,
                optionalServices: ['battery_service']
            });

            console.log(`[Bluetooth] Dispositivo selecionado: ${device.name || 'Sem nome'}`);
            setDevice(device);

            // Ouvinte para desconexão inesperada
            device.addEventListener('gattserverdisconnected', onDisconnected);

            console.log('[Bluetooth] Conectando ao servidor GATT...');
            const server = await device.gatt?.connect();
            
            if (server) {
                setServer(server);
                setStatus('connected');
                console.log('[Bluetooth] Conectado com sucesso!');
            } else {
                throw new Error('Falha ao conectar ao servidor GATT.');
            }

        } catch (err: any) {
            console.error('[Bluetooth] Erro na conexão:', err);
            setStatus('disconnected');
            if (err.name === 'NotFoundError') {
                setError('Seleção de dispositivo cancelada.');
            } else if (err.name === 'SecurityError') {
                setError('Requer HTTPS ou interação do usuário.');
            } else {
                setError(`Erro: ${err.message}`);
            }
        }
    };

    const handleDisconnect = () => {
        if (device && device.gatt?.connected) {
            console.log('[Bluetooth] Desconectando manualmente...');
            device.gatt.disconnect();
        }
        onDisconnected();
    };

    const onDisconnected = () => {
        console.log('[Bluetooth] Dispositivo desconectado.');
        setStatus('disconnected');
        setDevice(null);
        setServer(null);
    };

    return (
        <div className="flex flex-col gap-3 w-full bg-slate-900/40 border border-slate-800 p-4 rounded-2xl backdrop-blur-sm">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
                        status === 'connected' ? 'bg-emerald-500/20 text-emerald-400' : 
                        status === 'connecting' ? 'bg-amber-500/20 text-amber-400' : 
                        'bg-slate-800 text-slate-400'
                    }`}>
                        {status === 'connected' ? <Bluetooth size={20} /> : <BluetoothOff size={20} />}
                    </div>
                    <div>
                        <h4 className="text-sm font-bold text-slate-200">Integração Bluetooth</h4>
                        <div className="flex items-center gap-1.5 mt-0.5">
                            <span className={`w-1.5 h-1.5 rounded-full ${
                                status === 'connected' ? 'bg-emerald-500 animate-pulse' : 
                                status === 'connecting' ? 'bg-amber-500 animate-spin' : 
                                'bg-slate-600'
                            }`} />
                            <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">
                                {status === 'disconnected' && 'Desconectado'}
                                {status === 'connecting' && 'Conectando...'}
                                {status === 'connected' && `Conectado a: ${device?.name || 'Dispositivo'}`}
                            </p>
                        </div>
                    </div>
                </div>

                {status === 'connected' ? (
                    <button 
                        onClick={handleDisconnect}
                        className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all"
                        title="Desconectar"
                    >
                        <Unlink size={18} />
                    </button>
                ) : (
                    <button 
                        onClick={handleConnect}
                        disabled={status === 'connecting'}
                        className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-bold px-4 py-2 rounded-xl transition-all shadow-lg flex items-center gap-2"
                    >
                        {status === 'connecting' ? <Loader2 size={14} className="animate-spin" /> : <Bluetooth size={14} />}
                        🔵 Conectar via Bluetooth
                    </button>
                )}
            </div>

            {error && (
                <div className="flex items-center gap-2 text-[10px] text-red-400 bg-red-400/5 border border-red-400/20 p-2 rounded-lg mt-1">
                    <AlertCircle size={12} />
                    <span>{error}</span>
                </div>
            )}

            <div className="flex items-center gap-2 mt-1">
                <p className="text-[9px] text-slate-500 leading-tight">
                    * Funciona apenas em navegadores compatíveis (Chrome) e requer HTTPS. Utilize para futuras integrações de som e controle.
                </p>
            </div>
        </div>
    );
};

export default BluetoothConnect;
