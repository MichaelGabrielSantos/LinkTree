import Image from "next/image";

// Importação dos ícones
import iconOracle from "@/assets/icons8-logo-a-oracle.svg";
import iconOracleWhite from "@/assets/icons8-logo-a-oracle-white.svg";
import iconTypescript from "@/assets/icons8-texto-datilografado.svg";
import iconTypescriptWhite from "@/assets/icons8-texto-datilografado-white.svg";
import iconAdobe from "@/assets/icons8-logotipo-da-adobe.svg";
import iconAdobeWhite from "@/assets/icons8-logotipo-da-adobe-white.svg";
import iconNodeJs from "@/assets/icons8-nó-js.svg";
import iconNodeJsWhite from "@/assets/icons8-nó-js-white.svg";
import iconPowerAutomate from "@/assets/icons8-microsoft-power-automate.svg";
import iconPowerAutomateWhite from "@/assets/icons8-microsoft-power-automate-white.svg";
import iconPowerApps from "@/assets/icons8-microsoft-power-apps-2020.svg";
import iconPowerAppsWhite from "@/assets/icons8-microsoft-power-apps-2020-white.svg";
import iconReact from "@/assets/icons8-nativo-de-reagir.svg";
import iconReactWhite from "@/assets/icons8-nativo-de-reagir-white.svg";

// Tipagem das Props

interface ServiceProps{
  darkmode: boolean;
}
export default function TecnologiesCard({darkmode}:ServiceProps) {
  return (
    <div className={`flex flex-col justify-center items-center w-full h-auto rounded-lg transition-all box-border`}>
      <h2 className={`text-2xl font-bold ${darkmode ? 'text-gray-100' : 'text-gray-800'}`}>Tecnologias</h2>
      <div className="flex gap-4 box-border flex-wrap p-6 transition-all">
        <Image src={!darkmode ? iconOracle : iconOracleWhite} alt="Oracle Logo" width={40} height={40} />
        <Image src={!darkmode ? iconTypescript : iconTypescriptWhite} alt="TypeScript Logo" width={40} height={40} />
        <Image src={!darkmode ? iconAdobe : iconAdobeWhite} alt="Adobe Logo" width={40} height={40} />
        <Image src={!darkmode ? iconNodeJs : iconNodeJsWhite} alt="NodeJS Logo" width={40} height={40} />
        <Image src={!darkmode ? iconPowerAutomate : iconPowerAutomateWhite} alt="Power Automate Logo" width={40} height={40} />
        <Image src={!darkmode ? iconPowerApps : iconPowerAppsWhite} alt="Power Apps Logo" width={40} height={40} />
        <Image src={!darkmode ? iconReact : iconReactWhite} alt="React Logo" width={40} height={40} />
      </div>
    </div>
  );
}
