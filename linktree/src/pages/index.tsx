import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import ProfileCard from "@/components/profileCards";
import TecnologiesCard from "@/components/tecnologieCard";
import {
  Layers,
  LayoutDashboard,
  Megaphone,
  Moon,
  Brush,
  Smartphone,
  Store,
  Sun,
  Settings,
  UserCheck,
} from "lucide-react";

const services = [
  { name: "E-commerce", icon: Store },
  { name: "Landing Page", icon: LayoutDashboard },
  { name: "Landing Page de Vendas", icon: Megaphone },
  { name: "CMS", icon: Layers },
  { name: "Aplicativos", icon: Smartphone },
  { name: "Logotipos", icon: Brush },
  { name: "Automações", icon: Settings },
  { name: "Consultoria", icon: UserCheck },
];

export default function Home2() {
  const [darkMode, setDarkMode] = useState(false);
  const [hasScrolled, setHasScrolled] = useState(false);
  const [showContactButton, setShowContactButton] = useState(false);

  const phoneNumber = "5511973944686";

  // Detectar o dark mode do sistema automaticamente
  useEffect(() => {
    const systemPrefersDark = window.matchMedia(
      "(prefers-color-scheme: dark)"
    ).matches;
    setDarkMode(systemPrefersDark);
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      const scrollY = window.scrollY;
      setHasScrolled(scrollY > 50);
      setShowContactButton(scrollY > 100);
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div
      className={`${
        darkMode ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-900"
      } min-h-screen w-full flex flex-col transition-colors duration-500 pb-32`}
    >
      {/* Header com efeito de scroll */}
      <header
        className={`fixed top-0 left-0 w-full p-4 z-50 transition-all duration-300 ${
          hasScrolled
            ? darkMode
              ? "bg-gray-900 shadow-md"
              : "bg-white shadow-md"
            : "bg-transparent"
        }`}
      >
        <div className="w-full flex justify-between items-center max-w-5xl mx-auto">
          <button onClick={() => setDarkMode(!darkMode)}>
            {darkMode ? <Sun size={24} /> : <Moon size={24} />}
          </button>
        </div>
      </header>

      <main className="flex flex-col items-center w-full justify-center mt-4 gap-8 pt-16">
        <motion.div
          initial={{ opacity: 0, y: -50 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="w-full p-0"
        >
          <ProfileCard darkMode={darkMode} />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.3 }}
          className="p-0"
        >
          <TecnologiesCard darkmode={darkMode} />
        </motion.div>

        <motion.div className="w-full px-8 flex flex-col items-center gap-6">
          <h2
            className={`text-2xl font-bold ${
              darkMode ? "text-gray-100" : "text-gray-800"
            }`}
          >
            Meus Serviços
          </h2>
          <p
            className={`${
              darkMode ? "text-gray-200" : "text-gray-800"
            } text-center max-w-lg`}
          >
            Transformo ideias em soluções digitais eficientes. Confira os
            serviços que ofereço:
          </p>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 w-full gap-4">
            {services.map((service, index) => (
              <div
                key={index}
                className={`p-6 ${
                  darkMode ? "bg-bgCardDark" : "bg-bgCardLight"
                } text-white rounded-lg flex flex-col items-center justify-center text-center shadow-md transition`}
              >
                <service.icon className="w-8 h-8" />
                <p className="mt-2 font-semibold">{service.name}</p>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Botão de contato - Só aparece após 100px de scroll */}
        <motion.a
          href={`https://wa.me/${phoneNumber}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          <motion.button
            initial={{ opacity: 0, y: 20 }}
            animate={
              showContactButton ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }
            }
            transition={{ duration: 0.5 }}
            className={`fixed bottom-10 left-[5%] -translate-x-1/2 text-white px-6 py-3 rounded-full shadow-lg hover:bg-gray-700 w-[90%] shadow-[rgba(0,0,0,0.30)_-4px_4px_0px_2px] ${
              darkMode ? "bg-bgCardDark" : "bg-bgCardLight"
            }`}
            style={{ display: showContactButton ? "block" : "none" }}
          >
            Entrar em Contato
          </motion.button>
        </motion.a>
      </main>

      <footer className="flex gap-6 flex-wrap items-center justify-center p-4 mt-10 flex-col">
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1 }}
        >
          © {new Date().getFullYear()} - Central de Links 🚀 <br />
        </motion.p>
        <a
          className="text-sky-800 font-lg underline decoration-solid"
          href={`https://wa.me/${phoneNumber}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          Criar minha central de links
        </a>
      </footer>
    </div>
  );
}
