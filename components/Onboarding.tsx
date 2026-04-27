
import React, { useState } from 'react';
import { 
  User, 
  MapPin, 
  Target, 
  Users, 
  ArrowRight, 
  Loader2, 
  CheckCircle2,
  Briefcase
} from 'lucide-react';
import { db } from '../services/firebase';
import { doc, updateDoc } from 'firebase/firestore';

interface OnboardingProps {
  uid: string;
  onComplete: () => void;
}

const Onboarding: React.FC<OnboardingProps> = ({ uid, onComplete }) => {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    segment: '',
    goal: '',
    referral: ''
  });

  const handleNext = () => {
    if (step < 3) setStep(step + 1);
    else handleSubmit();
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const userRef = doc(db, 'users', uid);
      await updateDoc(userRef, {
        ...formData,
        isProfileComplete: true
      });
      onComplete();
    } catch (e) {
      console.error("Onboarding error", e);
      alert("Erro ao salvar perfil. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Background with animated gradients */}
      <div className="absolute inset-0 bg-slate-950">
        <div className="absolute top-[-10%] left-[-10%] w-96 h-96 bg-indigo-600/20 rounded-full blur-[128px] animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-96 h-96 bg-cyan-600/20 rounded-full blur-[128px] animate-pulse delay-700" />
      </div>

      <div className="w-full max-w-xl bg-slate-900 border border-slate-800 rounded-[2.5rem] shadow-2xl relative overflow-hidden flex flex-col min-h-[500px]">
        {/* Progress Bar */}
        <div className="absolute top-0 left-0 w-full h-1.5 flex gap-1 px-8 pt-8">
           {[1, 2, 3].map(i => (
             <div key={i} className={`h-full flex-1 rounded-full transition-all duration-500 ${i <= step ? 'bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.5)]' : 'bg-slate-800'}`} />
           ))}
        </div>

        <div className="p-8 md:p-12 flex-1 flex flex-col pt-16">
          {step === 1 && (
            <div className="animate-in slide-in-from-right-8 duration-500">
               <div className="w-16 h-16 bg-indigo-500/10 rounded-2xl flex items-center justify-center mb-6 border border-indigo-500/20">
                 <User className="text-indigo-400" size={32} />
               </div>
               <h2 className="text-3xl font-black text-white tracking-tight mb-2">Bem-vindo à VoxGen AI!</h2>
               <p className="text-slate-400 mb-8 leading-relaxed">Primeiro, como devemos te chamar?</p>
               
               <div className="space-y-4">
                 <div>
                   <label className="text-[10px] text-slate-500 uppercase font-black tracking-widest mb-1.5 block">Nome Completo</label>
                   <input 
                     type="text" 
                     value={formData.name}
                     onChange={e => setFormData({...formData, name: e.target.value})}
                     className="w-full bg-slate-800 border border-slate-700 rounded-2xl py-4 px-6 text-white outline-none focus:border-indigo-500 transition-all font-medium text-lg"
                     placeholder="Ex: Dan Lima"
                   />
                 </div>
               </div>
            </div>
          )}

          {step === 2 && (
            <div className="animate-in slide-in-from-right-8 duration-500">
               <div className="w-16 h-16 bg-cyan-500/10 rounded-2xl flex items-center justify-center mb-6 border border-cyan-500/20">
                 <Briefcase className="text-cyan-400" size={32} />
               </div>
               <h2 className="text-3xl font-black text-white tracking-tight mb-2">Seu Perfil</h2>
               <p className="text-slate-400 mb-8 leading-relaxed">Qual é o seu ramo de atuação principal?</p>
               
               <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                 {[
                   'Infoprodutor', 
                   'E-commerce / Droshipping', 
                   'Social Media / Agência', 
                   'Vendas Diretas',
                   'Outros'
                 ].map(opt => (
                   <button 
                     key={opt}
                     onClick={() => setFormData({...formData, segment: opt})}
                     className={`py-4 px-5 rounded-2xl border transition-all text-left font-bold ${formData.segment === opt ? 'bg-indigo-600 border-indigo-500 text-white shadow-xl shadow-indigo-900/20' : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600'}`}
                   >
                     {opt}
                   </button>
                 ))}
               </div>
            </div>
          )}

          {step === 3 && (
            <div className="animate-in slide-in-from-right-8 duration-500">
               <div className="w-16 h-16 bg-purple-500/10 rounded-2xl flex items-center justify-center mb-6 border border-purple-500/20">
                 <Target className="text-purple-400" size={32} />
               </div>
               <h2 className="text-3xl font-black text-white tracking-tight mb-2">Quase lá!</h2>
               <p className="text-slate-400 mb-8 leading-relaxed">Qual o seu principal objetivo com IAs de Voz?</p>
               
               <div className="space-y-4">
                 <select 
                   value={formData.goal}
                   onChange={e => setFormData({...formData, goal: e.target.value})}
                   className="w-full bg-slate-800 border border-slate-700 rounded-2xl py-4 px-6 text-white outline-none focus:border-indigo-500 transition-all font-bold text-lg appearance-none"
                 >
                   <option value="">Selecione um objetivo</option>
                   <option value="ads">Vídeos de Vendas (VSL)</option>
                   <option value="content">Conteúdo para Redes Sociais</option>
                   <option value="automation">Automação de Atendimento</option>
                   <option value="training">Treinamentos Internos</option>
                   <option value="other">Outros</option>
                 </select>

                 <div>
                   <label className="text-[10px] text-slate-500 uppercase font-black tracking-widest mb-1.5 block">Como nos conheceu?</label>
                   <input 
                     type="text" 
                     value={formData.referral}
                     onChange={e => setFormData({...formData, referral: e.target.value})}
                     className="w-full bg-slate-800 border border-slate-700 rounded-2xl py-4 px-6 text-white outline-none focus:border-indigo-500 transition-all font-medium"
                     placeholder="Ex: Instagram, Indicação..."
                   />
                 </div>
               </div>
            </div>
          )}

          <div className="mt-auto flex justify-between items-center pt-8">
            {step > 1 ? (
              <button 
                onClick={() => setStep(step - 1)}
                className="text-slate-500 hover:text-white font-bold text-sm transition-colors"
              >
                Voltar
              </button>
            ) : <div />}

            <button 
              onClick={handleNext}
              disabled={loading || (step === 1 && !formData.name) || (step === 2 && !formData.segment) || (step === 3 && !formData.goal)}
              className="bg-indigo-600 hover:bg-indigo-500 text-white font-black py-4 px-10 rounded-2xl flex items-center gap-3 transition-all shadow-xl shadow-indigo-900/20 disabled:opacity-50 disabled:cursor-not-allowed group"
            >
              {loading ? (
                <Loader2 className="animate-spin" />
              ) : (
                <>
                  {step === 3 ? 'Finalizar' : 'Próximo'}
                  <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Onboarding;
