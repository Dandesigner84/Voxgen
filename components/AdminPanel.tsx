
import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, 
  Plus, 
  Trash2, 
  Copy, 
  CheckCircle, 
  Mic2, 
  Users, 
  Ticket, 
  Search, 
  Filter, 
  TrendingUp, 
  Activity, 
  Crown, 
  Calendar,
  MoreVertical,
  RotateCcw,
  UserX,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Mail,
  Phone,
  Loader2,
  LayoutDashboard
} from 'lucide-react';
import { generateCode, getStoredCodes, deleteCode } from '../services/monetizationService';
import { getAllOfficialVoices, updateVoiceStatus, deleteCustomVoice } from '../services/voiceService';
import { 
  listAllUsers, 
  updateUserPlan, 
  resetUserUsage, 
  deleteUserAccount,
  getPlatformStats 
} from '../services/adminService';
import { PremiumCode, CustomVoice, UserRole, UserProfile } from '../types';

interface AdminPanelProps {
  userRole?: UserRole;
  userEmail?: string;
}

const AdminPanel: React.FC<AdminPanelProps> = ({ userRole = 'admin', userEmail }) => {
  const isSuperAdmin = userEmail === 'limadan389@gmail.com' || userRole === 'admin';
  
  const [activeTab, setActiveTab] = useState<'dashboard' | 'users' | 'codes' | 'voices'>('dashboard');
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'free' | 'premium'>('all');
  
  // Platform Data
  const [stats, setStats] = useState({ totalUsers: 0, premiumUsers: 0, totalNarrationsToday: 0 });
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [codes, setCodes] = useState<PremiumCode[]>([]);
  const [voices, setVoices] = useState<CustomVoice[]>([]);
  
  // Local Actions State
  const [daysToGen, setDaysToGen] = useState(30);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [activeTab]);

  const loadData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'dashboard') {
        const platformStats = await getPlatformStats();
        setStats(platformStats);
      } else if (activeTab === 'users') {
        const allUsers = await listAllUsers();
        setUsers(allUsers);
      } else if (activeTab === 'codes') {
        const storedCodes = await getStoredCodes();
        setCodes(storedCodes.reverse());
      } else if (activeTab === 'voices') {
        const allVoices = await getAllOfficialVoices();
        setVoices(allVoices);
      }
    } catch (error) {
      console.error("Error loading admin data", error);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdatePlan = async (uid: string, currentPlan: string) => {
    const newPlan = currentPlan === 'free' ? 'premium' : 'free';
    const days = newPlan === 'premium' ? 30 : undefined;
    
    if (confirm(`Alterar plano para ${newPlan.toUpperCase()}?`)) {
      await updateUserPlan(uid, newPlan, days);
      loadData();
    }
  };

  const handleResetUsage = async (uid: string) => {
    if (confirm('Resetar limite diário deste usuário?')) {
      await resetUserUsage(uid);
      loadData();
    }
  };

  const handleDeleteUser = async (uid: string) => {
    if (confirm('EXCLUIR PERMANENTEMENTE esta conta? Esta ação não pode ser desfeita.')) {
      await deleteUserAccount(uid);
      loadData();
    }
  };

  const handleGenerateCode = async () => {
    setLoading(true);
    await generateCode(daysToGen);
    setActiveTab('codes');
    await loadData();
  };

  const handleDeleteCode = async (code: string) => {
    if (confirm('Excluir este cupom?')) {
      await deleteCode(code);
      loadData();
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(text);
    setTimeout(() => setCopied(null), 2000);
  };

  const filteredUsers = users.filter(u => {
    const matchesSearch = (u.email?.toLowerCase().includes(searchTerm.toLowerCase())) || 
                          (u.name?.toLowerCase().includes(searchTerm.toLowerCase())) ||
                          (u.phoneNumber?.includes(searchTerm));
    const matchesFilter = statusFilter === 'all' || u.plan === statusFilter;
    return matchesSearch && matchesFilter;
  });

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      <div className="max-w-[1600px] mx-auto flex flex-col lg:flex-row min-h-screen">
        
        {/* Sidebar */}
        <aside className="w-full lg:w-72 border-b lg:border-b-0 lg:border-r border-slate-800 bg-slate-900/50 p-6 flex flex-col gap-8">
          <div className="flex items-center gap-3 px-2">
            <div className="p-2 bg-indigo-600 rounded-xl shadow-lg shadow-indigo-900/40">
              <ShieldCheck size={24} className="text-white" />
            </div>
            <div>
              <h2 className="font-black text-xl tracking-tighter text-white">VOXGEN ADM</h2>
              <p className="text-[10px] uppercase font-bold text-slate-500 tracking-widest">Painel de Controle</p>
            </div>
          </div>

          <nav className="flex flex-col gap-1">
            <button 
              onClick={() => setActiveTab('dashboard')} 
              className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all ${activeTab === 'dashboard' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/20' : 'hover:bg-slate-800 text-slate-400 hover:text-white'}`}
            >
              <LayoutDashboard size={18} /> Dashboard
            </button>
            <button 
              onClick={() => setActiveTab('users')} 
              className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all ${activeTab === 'users' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/20' : 'hover:bg-slate-800 text-slate-400 hover:text-white'}`}
            >
              <Users size={18} /> Usuários
            </button>
            <button 
              onClick={() => setActiveTab('codes')} 
              className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all ${activeTab === 'codes' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/20' : 'hover:bg-slate-800 text-slate-400 hover:text-white'}`}
            >
              <Ticket size={18} /> Cupons Premium
            </button>
            <button 
              onClick={() => setActiveTab('voices')} 
              className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all ${activeTab === 'voices' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/20' : 'hover:bg-slate-800 text-slate-400 hover:text-white'}`}
            >
              <Mic2 size={18} /> Narradores
            </button>
          </nav>

          <div className="mt-auto p-4 bg-slate-800/40 rounded-2xl border border-slate-800">
            <div className="flex items-center gap-3 mb-3">
               <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-xs font-bold">JD</div>
               <div className="overflow-hidden">
                 <p className="text-xs font-bold text-white truncate">{userEmail}</p>
                 <p className="text-[10px] text-slate-500 uppercase font-black">Plataforma Admin</p>
               </div>
            </div>
            <button className="w-full py-2 text-xs font-bold text-red-400 bg-red-400/10 hover:bg-red-400/20 rounded-lg transition-colors">Sair do Painel</button>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 p-6 lg:p-10">
          
          {/* Header Stats */}
          {activeTab === 'dashboard' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10 animate-fade-in">
              <div className="bg-slate-900 border border-slate-800 p-6 rounded-3xl group hover:border-indigo-500/50 transition-all">
                <div className="flex justify-between items-start mb-4">
                  <div className="p-3 bg-blue-500/10 rounded-2xl text-blue-400">
                    <Users size={24} />
                  </div>
                  <span className="text-[10px] font-bold text-green-400 flex items-center gap-1 bg-green-400/10 px-2 py-0.5 rounded-full">
                    <TrendingUp size={10} /> +12%
                  </span>
                </div>
                <h3 className="text-slate-400 text-sm font-medium mb-1">Total de Usuários</h3>
                <p className="text-3xl font-black text-white">{stats.totalUsers}</p>
                <div className="mt-4 pt-4 border-t border-slate-800 flex items-center justify-between">
                  <span className="text-xs text-slate-500">Métrica Global</span>
                  <button onClick={() => setActiveTab('users')} className="text-xs text-blue-400 font-bold flex items-center gap-1 hover:underline">Ver todos <ArrowUpRight size={12} /></button>
                </div>
              </div>

              <div className="bg-slate-900 border border-slate-800 p-6 rounded-3xl group hover:border-amber-500/50 transition-all">
                <div className="flex justify-between items-start mb-4">
                  <div className="p-3 bg-amber-500/10 rounded-2xl text-amber-400">
                    <Crown size={24} />
                  </div>
                  <span className="text-[10px] font-bold text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-full">
                    Premium Active
                  </span>
                </div>
                <h3 className="text-slate-400 text-sm font-medium mb-1">Membros Premium</h3>
                <p className="text-3xl font-black text-white">{stats.premiumUsers}</p>
                <div className="mt-4 pt-4 border-t border-slate-800 flex items-center justify-between">
                  <span className="text-xs text-slate-500">Taxa: {((stats.premiumUsers / (stats.totalUsers || 1)) * 100).toFixed(1)}%</span>
                  <button onClick={() => setActiveTab('codes')} className="text-xs text-amber-400 font-bold flex items-center gap-1 hover:underline">Novo cupom <ArrowUpRight size={12} /></button>
                </div>
              </div>

              <div className="bg-slate-900 border border-slate-800 p-6 rounded-3xl group hover:border-emerald-500/50 transition-all">
                <div className="flex justify-between items-start mb-4">
                  <div className="p-3 bg-emerald-500/10 rounded-2xl text-emerald-400">
                    <Activity size={24} />
                  </div>
                  <div className="animate-pulse w-2 h-2 rounded-full bg-emerald-500"></div>
                </div>
                <h3 className="text-slate-400 text-sm font-medium mb-1">Narralções Hoje</h3>
                <p className="text-3xl font-black text-white">{stats.totalNarrationsToday}</p>
                <div className="mt-4 pt-4 border-t border-slate-800 flex items-center justify-between text-xs text-slate-500">
                  <span>Atividade Real-time</span>
                  <span className="text-emerald-400 font-bold uppercase tracking-widest text-[9px]">Servidor OK</span>
                </div>
              </div>
            </div>
          )}

          {/* User Management Section */}
          {activeTab === 'users' && (
            <div className="animate-fade-in space-y-6">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                  <h2 className="text-2xl font-black text-white mb-1 tracking-tight">Gestão de Usuários</h2>
                  <p className="text-slate-500 text-sm">{filteredUsers.length} usuários encontrados</p>
                </div>
                <div className="flex items-center gap-3 w-full md:w-auto">
                   <div className="relative flex-1 md:w-80">
                     <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                     <input 
                       type="text" 
                       placeholder="Buscar por nome, email ou tel..." 
                       value={searchTerm}
                       onChange={e => setSearchTerm(e.target.value)}
                       className="w-full bg-slate-900 border border-slate-800 rounded-2xl py-3 pl-12 pr-4 text-white outline-none focus:border-indigo-500 transition-all"
                     />
                   </div>
                   <select 
                     value={statusFilter}
                     onChange={e => setStatusFilter(e.target.value as any)}
                     className="bg-slate-900 border border-slate-800 rounded-2xl px-4 py-3 text-sm text-white outline-none focus:border-indigo-500"
                   >
                     <option value="all">Filtro Plano</option>
                     <option value="free">Free</option>
                     <option value="premium">Premium</option>
                   </select>
                </div>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden overflow-x-auto shadow-2xl">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-800/40 border-b border-slate-800">
                      <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Usuário</th>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Contato</th>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-center">Plano</th>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-center">Uso Hoje</th>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-center">Cadastro</th>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.length > 0 ? (
                      filteredUsers.map((u) => (
                        <tr key={u.uid} className="border-b border-slate-800/50 hover:bg-slate-800/20 transition-colors group">
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${u.plan === 'premium' ? 'bg-amber-500/10 text-amber-500' : 'bg-slate-700 text-slate-400'}`}>
                                {(u.name || u.email || '?')[0].toUpperCase()}
                              </div>
                              <div>
                                <p className="text-sm font-bold text-white">{u.name || 'Sem Nome'}</p>
                                <p className="text-[10px] text-slate-500 font-mono">{u.uid.substring(0, 8)}...</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="space-y-1">
                              {u.email && <div className="flex items-center gap-2 text-xs text-slate-300"><Mail size={12} className="text-slate-500" /> {u.email}</div>}
                              {u.phoneNumber && <div className="flex items-center gap-2 text-xs text-slate-300"><Phone size={12} className="text-slate-500" /> {u.phoneNumber}</div>}
                            </div>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <span className={`px-2 py-1 rounded-full text-[10px] font-black uppercase tracking-tight ${u.plan === 'premium' ? 'bg-amber-500/10 text-amber-500' : 'bg-slate-700 text-slate-400'}`}>
                              {u.plan}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <div className="flex flex-col items-center">
                              <span className="text-sm font-bold text-white">{u.narrationsToday || 0}</span>
                              <div className="w-12 h-1 bg-slate-800 rounded-full mt-1 overflow-hidden">
                                <div 
                                  className="h-full bg-indigo-500" 
                                  style={{ width: `${Math.min(((u.narrationsToday || 0) / (u.plan === 'premium' ? 100 : 10)) * 100, 100)}%` }} 
                                />
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <p className="text-xs text-slate-400">{new Date(u.createdAt).toLocaleDateString()}</p>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button 
                                onClick={() => handleUpdatePlan(u.uid, u.plan)} 
                                title={u.plan === 'free' ? "Ativar Premium" : "Remover Premium"}
                                className="p-2 bg-slate-900 border border-slate-700 rounded-xl hover:text-amber-400 transition-colors"
                              >
                                {u.plan === 'free' ? <Crown size={16} /> : <UserX size={16} />}
                              </button>
                              <button 
                                onClick={() => handleResetUsage(u.uid)} 
                                title="Resetar Limite"
                                className="p-2 bg-slate-900 border border-slate-700 rounded-xl hover:text-blue-400 transition-colors"
                              >
                                <RotateCcw size={16} />
                              </button>
                              <button 
                                onClick={() => handleDeleteUser(u.uid)} 
                                title="Excluir Definitivamente"
                                className="p-2 bg-slate-900 border border-slate-700 rounded-xl hover:text-red-400 transition-colors text-red-500/60"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={6} className="px-6 py-20 text-center">
                          <div className="flex flex-col items-center text-slate-600">
                             <Search size={48} className="mb-4 opacity-20" />
                             <p className="text-lg font-bold">Nenhum usuário encontrado</p>
                             <p className="text-sm">Tente uma busca diferente ou verifique os filtros.</p>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              
              <div className="flex justify-center gap-2">
                 <button className="p-3 bg-slate-900 border border-slate-800 rounded-xl disabled:opacity-50" disabled><ChevronLeft size={18} /></button>
                 <button className="px-5 py-3 bg-indigo-600 text-white rounded-xl text-sm font-bold">1</button>
                 <button className="p-3 bg-slate-900 border border-slate-800 rounded-xl disabled:opacity-50" disabled><ChevronRight size={18} /></button>
              </div>
            </div>
          )}

          {/* Premium Codes Section */}
          {activeTab === 'codes' && (
            <div className="animate-fade-in grid grid-cols-1 xl:grid-cols-3 gap-8">
              <div className="xl:col-span-1 space-y-6">
                <div className="bg-slate-900 border border-slate-800 p-8 rounded-3xl relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-4 opacity-5 rotate-12">
                    <Ticket size={120} />
                  </div>
                  <h3 className="text-xl font-black text-white mb-6 tracking-tight">Gerar Cupons Premium</h3>
                  
                  <div className="space-y-6 relative z-10">
                    <div>
                      <label className="text-[10px] text-slate-500 font-black uppercase tracking-widest mb-2 block">Duração do Acesso</label>
                      <select 
                        value={daysToGen} 
                        onChange={(e) => setDaysToGen(Number(e.target.value))} 
                        className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 text-white font-bold outline-none focus:border-indigo-500 transition-all appearance-none"
                      >
                        <option value={7}>07 Dias (Teste)</option>
                        <option value={30}>30 Dias (Mensal)</option>
                        <option value={90}>90 Dias (Trimestral)</option>
                        <option value={180}>180 Dias (Semestral)</option>
                        <option value={365}>01 Ano (Anual)</option>
                      </select>
                    </div>

                    <button 
                      onClick={handleGenerateCode} 
                      disabled={loading}
                      className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-black py-4 rounded-2xl flex items-center justify-center gap-3 shadow-xl transition-all hover:-translate-y-1 active:translate-y-0"
                    >
                      {loading ? <Loader2 className="animate-spin" /> : <><Plus size={22} /> Gerar Novo Código</>}
                    </button>

                    <div className="pt-4 border-t border-slate-800/50">
                       <p className="text-[10px] text-slate-500 font-bold leading-relaxed">
                         * O cupom gerado poderá ser utilizado uma única vez por qualquer usuário cadastrado para desbloquear acesso ilimitado.
                       </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="xl:col-span-2 space-y-4">
                <h3 className="text-sm font-black text-slate-500 uppercase tracking-widest pl-2">Códigos Recentes</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {codes.map((code) => (
                    <div key={code.code} className="bg-slate-900/50 border border-slate-800 p-5 rounded-2xl flex items-center justify-between group hover:border-indigo-500/30 transition-all">
                      <div className="flex flex-col gap-1">
                        <code className="text-lg font-black text-white tracking-widest">{code.code}</code>
                        <div className="flex items-center gap-2">
                           <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">{code.days}D</span>
                           {code.isRedeemed ? (
                             <span className="text-[9px] font-bold text-green-400 bg-green-400/5 px-2 py-0.5 rounded-full flex items-center gap-1">
                               <CheckCircle size={8} /> Resgatado
                             </span>
                           ) : (
                             <span className="text-[9px] font-bold text-slate-500 italic">Disponível</span>
                           )}
                        </div>
                      </div>
                      <div className="flex gap-2">
                         <button 
                           onClick={() => copyToClipboard(code.code)} 
                           className="p-3 bg-slate-950 border border-slate-800 rounded-xl hover:text-white transition-colors relative"
                         >
                           {copied === code.code ? <CheckCircle size={18} className="text-green-400" /> : <Copy size={18} />}
                           {copied === code.code && (
                             <span className="absolute -top-8 left-1/2 -translate-x-1/2 bg-green-500 text-white text-[8px] px-2 py-1 rounded uppercase font-black">Copiado</span>
                           )}
                         </button>
                         <button 
                           onClick={() => handleDeleteCode(code.code)} 
                           className="p-3 bg-slate-950 border border-slate-800 rounded-xl hover:text-red-400 transition-colors"
                         >
                           <Trash2 size={18} />
                         </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Voices Section (Re-used existing logic but improved UI) */}
          {activeTab === 'voices' && (
            <div className="animate-fade-in space-y-8">
               <div className="bg-gradient-to-br from-indigo-900/20 to-transparent border border-indigo-500/20 p-8 rounded-3xl">
                  <div className="flex items-center gap-4 mb-4">
                    <div className="p-3 bg-indigo-500/20 rounded-2xl text-indigo-400">
                      <Mic2 size={32} />
                    </div>
                    <div>
                      <h2 className="text-2xl font-black text-white tracking-tight">Curadoria de Vozes</h2>
                      <p className="text-slate-400 text-sm">Aprove ou rejeite narradores que desejam se tornar oficiais</p>
                    </div>
                  </div>
               </div>

               <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                 {voices.length > 0 ? (
                   voices.map(voice => (
                     <div key={voice.id} className="bg-slate-900 border border-slate-800 p-6 rounded-3xl flex flex-col gap-6 hover:border-slate-700 transition-all">
                        <div className="flex justify-between items-start">
                           <div className="flex items-center gap-4">
                             <div className="w-12 h-12 bg-slate-800 rounded-2xl flex items-center justify-center font-bold text-indigo-400">
                               {voice.name[0]}
                             </div>
                             <div>
                               <h4 className="font-bold text-white mb-0.5">{voice.name}</h4>
                               <p className="text-[10px] text-slate-500 font-mono">{voice.userId}</p>
                             </div>
                           </div>
                           <span className={`text-[9px] px-2 py-1 rounded-full font-black uppercase tracking-widest ${voice.category === 'official_approved' ? 'bg-green-500/10 text-green-400' : 'bg-amber-500/10 text-amber-400'}`}>
                             {voice.category === 'official_approved' ? 'Aprovado' : 'Candidato'}
                           </span>
                        </div>
                        
                        <div className="grid grid-cols-3 gap-2 py-4 border-y border-slate-800/50">
                           <div className="text-center">
                             <p className="text-[8px] uppercase font-black text-slate-600 tracking-widest">Clareza</p>
                             <p className="text-md font-black text-white">{voice.aiAnalysis?.clarityScore || 0}%</p>
                           </div>
                           <div className="text-center border-x border-slate-800">
                             <p className="text-[8px] uppercase font-black text-slate-600 tracking-widest">Dicção</p>
                             <p className="text-md font-black text-white">{voice.aiAnalysis?.dictionScore || 0}%</p>
                           </div>
                           <div className="text-center">
                             <p className="text-[8px] uppercase font-black text-slate-600 tracking-widest">Ritmo</p>
                             <p className="text-md font-black text-white">{voice.aiAnalysis?.rhythmScore || 0}%</p>
                           </div>
                        </div>

                        <div className="flex gap-3 mt-auto">
                           {voice.category !== 'official_approved' ? (
                             <>
                               <button 
                                 onClick={() => updateVoiceStatus(voice.id, 'official_approved', 'Excelente qualidade! Bem-vindo.')} 
                                 className="flex-1 bg-green-600 hover:bg-green-500 text-white py-3 rounded-2xl text-xs font-black transition-all shadow-lg shadow-green-900/10"
                               >
                                 Aprovar
                               </button>
                               <button 
                                 onClick={() => updateVoiceStatus(voice.id, 'official_rejected', 'Sua voz não atende aos critérios oficiais no momento.')} 
                                 className="flex-1 bg-slate-800 hover:bg-red-900/40 text-slate-400 hover:text-red-400 py-3 rounded-2xl text-xs font-black transition-all"
                               >
                                 Rejeitar
                               </button>
                             </>
                           ) : (
                             <button 
                               onClick={() => updateVoiceStatus(voice.id, 'official_candidate', 'Status resetado.')} 
                               className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 py-3 rounded-2xl text-xs font-black transition-all"
                             >
                               Remover Sêlo Oficial
                             </button>
                           )}
                        </div>
                     </div>
                   ))
                 ) : (
                   <div className="col-span-full py-20 text-center flex flex-col items-center">
                      <Mic2 size={48} className="opacity-10 mb-4" />
                      <p className="text-slate-500 font-bold">Nenhum narrador encontrado para moderação</p>
                   </div>
                 )}
               </div>
            </div>
          )}

        </main>
      </div>
    </div>
  );
};

export default AdminPanel;
