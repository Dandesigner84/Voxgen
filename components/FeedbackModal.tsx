
import React, { useState } from 'react';
import { Star, X, MessageSquare, Send, CheckCircle } from 'lucide-react';
import { submitFeedback } from '../services/analyticsService';
import { motion, AnimatePresence } from 'motion/react';

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  userName: string;
  userEmail: string;
}

const FeedbackModal: React.FC<FeedbackModalProps> = ({ isOpen, onClose, userId, userName, userEmail }) => {
  const [rating, setRating] = useState(5);
  const [hoveredRating, setHoveredRating] = useState<number | null>(null);
  const [comment, setComment] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success'>('idle');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('submitting');
    try {
      await submitFeedback({
        userId,
        userName,
        userEmail,
        rating,
        comment
      });
      setStatus('success');
      setTimeout(() => {
        onClose();
        setStatus('idle');
      }, 2000);
    } catch (e) {
      console.error(e);
      setStatus('idle');
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          className="bg-slate-900 border border-indigo-500/30 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl"
        >
          {status === 'success' ? (
            <div className="p-12 text-center flex flex-col items-center gap-4">
               <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center text-green-500 mb-2">
                 <CheckCircle size={48} />
               </div>
               <h2 className="text-2xl font-black text-white">Obrigado pelo seu Feedback!</h2>
               <p className="text-slate-400">Sua avaliação ajuda a tornar o VoxGen cada vez melhor.</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <div className="p-6 border-b border-slate-800 flex justify-between items-center bg-slate-800/20">
                 <div className="flex items-center gap-3">
                   <div className="p-2 bg-indigo-600 rounded-xl text-white">
                      <Star size={20} fill="currentColor" />
                   </div>
                   <h2 className="text-lg font-black text-white tracking-tight">Avaliar VoxGen AI</h2>
                 </div>
                 <button type="button" onClick={onClose} className="p-2 text-slate-500 hover:text-white transition-colors">
                    <X size={20} />
                 </button>
              </div>

              <div className="p-8 space-y-8">
                 <div className="text-center">
                    <p className="text-[10px] uppercase font-black text-slate-500 tracking-widest mb-4">Sua Nota</p>
                    <div className="flex justify-center gap-3">
                       {[1, 2, 3, 4, 5].map((star) => (
                         <button
                           key={star}
                           type="button"
                           onMouseEnter={() => setHoveredRating(star)}
                           onMouseLeave={() => setHoveredRating(null)}
                           onClick={() => setRating(star)}
                           className="transition-transform active:scale-90"
                         >
                           <Star 
                             size={36} 
                             className={`${(hoveredRating !== null ? star <= hoveredRating : star <= rating) ? 'text-amber-500 fill-amber-500' : 'text-slate-800'} transition-colors`}
                           />
                         </button>
                       ))}
                    </div>
                    <p className="mt-4 text-sm font-bold text-slate-300">
                       {rating === 1 && "Poderia melhorar"}
                       {rating === 2 && "Bom, mas com ressalvas"}
                       {rating === 3 && "Gostei bastante"}
                       {rating === 4 && "Excelente ferramenta"}
                       {rating === 5 && "Incrível, superou expectativas!"}
                    </p>
                 </div>

                 <div>
                    <label className="text-[10px] uppercase font-black text-slate-500 tracking-widest mb-2 block">Seu Depoimento</label>
                    <div className="relative">
                       <MessageSquare className="absolute left-4 top-4 text-slate-600" size={18} />
                       <textarea
                         required
                         value={comment}
                         onChange={(e) => setComment(e.target.value)}
                         placeholder="Conte-nos como está sendo sua experiência..."
                         className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 pl-12 text-white text-sm outline-none focus:border-indigo-500 transition-all min-h-[120px] resize-none"
                       />
                    </div>
                 </div>

                 <button
                   type="submit"
                   disabled={status === 'submitting'}
                   className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-black py-4 rounded-2xl flex items-center justify-center gap-3 shadow-xl shadow-indigo-900/20 transition-all hover:-translate-y-1"
                 >
                   {status === 'submitting' ? 'Enviando...' : <><Send size={18} /> Enviar Avaliação</>}
                 </button>
              </div>
            </form>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default FeedbackModal;
