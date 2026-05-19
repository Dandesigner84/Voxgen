
import React from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { RefreshCw, Download, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

const ReloadPrompt: React.FC = () => {
  const swResult = useRegisterSW({
    onRegistered(r) {
      console.log('SW Registered: ', r);
    },
    onRegisterError(error) {
      console.log('SW registration error', error);
    },
  });

  // Safe access to swResult to prevent destructuring errors
  const [offlineReady, setOfflineReady] = swResult?.offlineReady || [false, () => {}];
  const [needUpdate, setNeedUpdate] = swResult?.needUpdate || [false, () => {}];
  const updateServiceWorker = swResult?.updateServiceWorker || (() => {});

  const close = () => {
    setOfflineReady(false);
    setNeedUpdate(false);
  };

  // Detect if app is "installed" (standalone mode)
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches 
    || (window.navigator as any).standalone 
    || document.referrer.includes('android-app://');

  return (
    <AnimatePresence>
      {(offlineReady || needUpdate) && (
        <motion.div
          initial={{ opacity: 0, y: 50, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 50, scale: 0.95 }}
          className="fixed bottom-4 left-4 right-4 md:left-auto md:right-8 md:bottom-8 z-[9999]"
        >
          <div className="bg-slate-900 border border-slate-800 shadow-2xl rounded-2xl p-4 md:w-96 backdrop-blur-xl bg-opacity-90">
            <div className="flex items-start gap-4">
              <div className={`p-2 rounded-full ${needUpdate ? 'bg-indigo-500/10 text-indigo-400' : 'bg-emerald-500/10 text-emerald-400'}`}>
                {needUpdate ? <RefreshCw className="w-5 h-5 animate-spin-slow" /> : <Download className="w-5 h-5" />}
              </div>
              
              <div className="flex-1">
                <h3 className="text-white font-semibold text-sm">
                  {needUpdate ? 'Nova versão disponível!' : 'App pronto para uso offline!'}
                </h3>
                <p className="text-slate-400 text-xs mt-1 leading-relaxed">
                  {needUpdate 
                    ? 'Uma atualização foi encontrada. Clique para carregar as novas funcionalidades e melhorias.' 
                    : 'VoxGen agora está disponível sem internet.'}
                </p>
                
                <div className="flex items-center gap-2 mt-4">
                  {needUpdate && (
                    <button
                      onClick={() => updateServiceWorker(true)}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-medium transition-colors flex items-center gap-2 w-full justify-center group"
                    >
                      <RefreshCw className="w-3.5 h-3.5 group-hover:rotate-180 transition-transform duration-500" />
                      {isStandalone ? 'Atualizar Agora' : 'Recarregar Página'}
                    </button>
                  )}
                  
                  {!needUpdate && isStandalone && (
                    <div className="flex items-center gap-2 text-[10px] text-slate-500 bg-slate-800/50 px-2 py-1 rounded border border-slate-700/50">
                      <AlertCircle className="w-3 h-3" />
                      App Instalado Localmente
                    </div>
                  )}

                  <button
                    onClick={() => close()}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium transition-colors"
                  >
                    Fechar
                  </button>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default ReloadPrompt;
