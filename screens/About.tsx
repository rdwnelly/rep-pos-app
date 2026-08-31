import React from 'react';
import { Info, MapPin, Building, Globe, CheckCircle, Users, Code, Server, Heart } from 'lucide-react';
import { SiGithub, SiWhatsapp } from '@icons-pack/react-simple-icons';

export const About: React.FC = () => {
    return (
        <div className="space-y-6 animate-fade-in pb-10">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold text-slate-800 flex items-center gap-2">
                        <Info className="text-primary" />
                        Tentang Aplikasi
                    </h1>
                    <p className="text-slate-500 text-sm mt-1">Sistem Informasi Keuangan & Operasional (SIK-REP)</p>
                </div>
            </div>

            {/* Tentang Yayasan */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="bg-primary/10 px-8 py-6 border-b border-primary/20">
                    <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-3">
                        <Building className="text-primary" size={28} />
                        Yayasan Rumah Etnik Papua (REP)
                    </h2>
                </div>
                <div className="p-8">
                    <div className="flex items-start gap-3 mb-6 text-slate-600 bg-slate-50 p-4 rounded-xl border border-slate-100">
                        <MapPin className="text-accent flex-shrink-0 mt-0.5" size={20} />
                        <p className="font-medium text-sm">
                            Jalan Baru Aimas - Klamono Km. 21, Kabupaten Sorong, Provinsi Papua Barat Daya.
                        </p>
                    </div>
                    
                    <p className="text-slate-700 leading-relaxed mb-6 text-justify">
                        Kami didirikan dengan visi luhur untuk menjadi pusat wisata budaya dan edukasi Papua yang berkelanjutan, serta menjadi motor penggerak pelestarian budaya dan pemberdayaan masyarakat asli Papua.
                    </p>
                    
                    <p className="text-slate-700 leading-relaxed text-justify">
                        Sebagai wujud nyata pelestarian adat istiadat, REP menghadirkan pengalaman autentik melalui berbagai fasilitas unggulan, seperti wisata arsitektur rumah tradisional, Museum Budaya Mini, penyewaan pakaian adat, sajian kuliner khas di <strong>Yaswar Cafe</strong>, atraksi seni pertunjukan, hingga fasilitas akomodasi <strong>Homestay</strong> bernuansa etnik Papua.
                    </p>
                </div>
            </div>

            {/* Misi Digitalisasi */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 h-full">
                    <h3 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2">
                        <Globe className="text-blue-500" />
                        Misi Digitalisasi Kami
                    </h3>
                    <p className="text-slate-600 mb-6 text-sm leading-relaxed text-justify">
                        Sistem ini merupakan bagian dari langkah transformasi digital Yayasan Rumah Etnik Papua untuk menghadirkan tata kelola administrasi yang efisien, transparan, dan profesional. Ekosistem digital REP mencakup:
                    </p>
                    
                    <ul className="space-y-4">
                        <li className="flex items-start gap-3">
                            <CheckCircle className="text-green-500 mt-1 flex-shrink-0" size={18} />
                            <div>
                                <strong className="text-slate-800 text-sm">Sistem Manajemen Reservasi Homestay</strong>
                                <p className="text-slate-500 text-xs mt-0.5 text-justify">Mengelola ketersediaan kamar, riwayat tamu, dan layanan hospitality yang terintegrasi.</p>
                            </div>
                        </li>
                        <li className="flex items-start gap-3">
                            <CheckCircle className="text-green-500 mt-1 flex-shrink-0" size={18} />
                            <div>
                                <strong className="text-slate-800 text-sm">Sistem Informasi Keuangan (SIK-REP)</strong>
                                <p className="text-slate-500 text-xs mt-0.5 text-justify">Memastikan pencatatan akuntansi, buku besar, dan laba-rugi berjalan secara real-time dan akurat.</p>
                            </div>
                        </li>
                        <li className="flex items-start gap-3">
                            <CheckCircle className="text-green-500 mt-1 flex-shrink-0" size={18} />
                            <div>
                                <strong className="text-slate-800 text-sm">Operasional Manajemen Gudang (OMG)</strong>
                                <p className="text-slate-500 text-xs mt-0.5 text-justify">Mengelola rantai pasok (supply chain) suvenir kerajinan tangan lokal dan bahan baku unit bisnis.</p>
                            </div>
                        </li>
                    </ul>

                    <div className="mt-8 bg-blue-50 p-4 rounded-xl flex items-center gap-3 border border-blue-100">
                        <Server className="text-blue-600 flex-shrink-0" size={24} />
                        <p className="text-xs text-blue-800 font-medium leading-relaxed text-justify">
                            Sistem ini didukung oleh teknologi Cloud Serverless yang tangguh dan aman, serta dilengkapi fitur Progressive Web App (PWA) untuk memberikan pengalaman pengguna terbaik di berbagai perangkat.
                        </p>
                    </div>
                </div>

                {/* Pengurus & Developer */}
                <div className="space-y-6">
                    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
                        <h3 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2">
                            <Users className="text-purple-500" />
                            Susunan Pengurus Yayasan
                        </h3>
                        <p className="text-slate-600 text-sm mb-4">Sistem ini beroperasi di bawah naungan susunan organ Yayasan Rumah Etnik Papua:</p>
                        
                        <div className="space-y-4">
                            <div className="flex items-center gap-4 bg-slate-50 p-3 rounded-lg border border-slate-100">
                                <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center text-purple-600 font-bold">FB</div>
                                <div>
                                    <p className="font-bold text-slate-800">Fricky Mosche Burdam</p>
                                    <p className="text-xs text-slate-500 font-medium">Ketua Pembina Yayasan</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-4 bg-slate-50 p-3 rounded-lg border border-slate-100">
                                <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center text-purple-600 font-bold">MW</div>
                                <div>
                                    <p className="font-bold text-slate-800">Mitshi Wanma</p>
                                    <p className="text-xs text-slate-500 font-medium">Ketua Pengurus / Pimpinan REP</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="bg-slate-800 rounded-2xl shadow-sm border border-slate-700 p-8 text-white relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-accent/20 rounded-full blur-3xl -mr-10 -mt-10"></div>
                        <h3 className="text-xl font-bold mb-6 flex items-center gap-2 relative z-10">
                            <Code className="text-accent" />
                            Informasi Pengembang
                        </h3>
                        <p className="text-slate-300 text-sm mb-6 relative z-10 leading-relaxed text-justify">
                            Arsitektur dan ekosistem perangkat lunak ini dirancang, dibangun, dan dikembangkan secara dedikatif oleh:
                        </p>
                        
                        <div className="space-y-4 relative z-10">
                            <div>
                                <p className="text-accent font-bold text-lg">Ridwan Elly</p>
                                <p className="text-xs text-slate-400">Lead Full-Stack Software Engineer</p>
                            </div>
                            
                            <div className="flex flex-wrap gap-3 pt-2">
                                <a href="https://web.whatsapp.com/send?phone=6281342310203" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 bg-white/10 hover:bg-white/20 px-3 py-2 rounded-lg text-sm transition-colors backdrop-blur-sm" title="Chat via WhatsApp Web">
                                    <SiWhatsapp size={16} className="text-green-400" />
                                    0813 4231 0203
                                </a>
                                <a href="https://github.com/rdwnelly" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 bg-white/10 hover:bg-white/20 px-3 py-2 rounded-lg text-sm transition-colors backdrop-blur-sm">
                                    <SiGithub size={16} />
                                    github.com/rdwnelly
                                </a>
                            </div>
                        </div>
                        
                        <div className="mt-8 pt-6 border-t border-slate-700/50 flex items-center justify-center gap-2 text-xs text-slate-400 relative z-10 text-center">
                            Dibuat dengan <Heart size={14} className="text-red-500" /> untuk kemajuan dan pelestarian budaya di Tanah Papua.
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
