import Link from "next/link";
import { EmptyState } from "@/components/ui";

export default function NotFound() {
  return (
    <EmptyState title="Página não encontrada">
      O item pode ter sido removido da fonte ou o endereço está incorreto. <Link href="/explorar" className="underline">Pesquisar</Link>
    </EmptyState>
  );
}
