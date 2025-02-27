import Image from "next/image";
import {
  LucideInstagram,
  LucideLinkedin,
  LucideMail,
  LucideGithub,
} from "lucide-react";
import foto from "@/assets/perfil.jpg";

interface ProfileCardProps {
  darkMode: boolean;
}

export default function ProfileCard({
  darkMode,
}: ProfileCardProps) {
  return (
    <div className={`flex flex-col items-center h-auto px-8 w-full`}>
      <div
        className={`relative ${
          darkMode ? "bg-bgCardDark" : "bg-bgCardLight"
        } text-white p-8 pb-12 rounded-3xl mt-12 shadow-lg w-full gap-8 flex flex-col w-full shadow-[rgba(0,0,0,0.30)_-9px_8px_0px_2px]`}
      >
        <div className="absolute -top-16 left-1/2 transform -translate-x-1/2 ">
          <Image
            src={foto}
            alt="Foto de perfil"
            width={130}
            className={`rounded-full border-8 object-cover ${
              darkMode ? "border-gray-900" : "border-profileLight"
            } h-[130px]`}
          />
        </div>

        <div className="mt-12 text-center">
          <h2 className="text-xl font-semibold">Michael Gabriel Santos</h2>
          <p className="text-sm mt-2">
            Olá! seja muito bem-vindo(a) à minha pequena central de links!
          </p>
        </div>

        <div className="flex justify-center space-x-6">
          <a href="https://www.instagram.com/maicoding/" className="hover:text-gray-400">
            <LucideInstagram />
          </a>
          <a href="https://www.linkedin.com/in/michael-gabriel-santos/" className="hover:text-gray-400">
            <LucideLinkedin />
          </a>
          <a href="mailto:michaelgabrielsantos@outlook.com" className="hover:text-gray-400">
            <LucideMail />
          </a>
          <a href="https://github.com/MichaelGabrielSantos" className="hover:text-gray-400">
            <LucideGithub />
          </a>
        </div>
      </div>
    </div>
  );
}
