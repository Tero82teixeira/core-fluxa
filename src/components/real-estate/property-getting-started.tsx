import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

export function PropertyGettingStarted({
  onCreate,
  onSettlements,
}: {
  onCreate?: () => void;
  onSettlements: () => void;
}) {
  return (
    <details className="rounded-xl border bg-card p-4">
      <summary className="cursor-pointer font-semibold">Como começar na FLUXA Imobiliária</summary>
      <ol className="mt-4 grid list-inside list-decimal gap-4 text-sm sm:grid-cols-2">
        <li className="space-y-2 rounded-lg border p-3">
          <strong>Cadastre as pessoas</strong>
          <p className="text-muted-foreground">
            Em Clientes, registre o proprietário e os interessados para vinculá-los ao imóvel e à
            negociação.
          </p>
          <Button asChild variant="outline" size="sm">
            <Link to="/clientes">Abrir clientes</Link>
          </Button>
        </li>
        <li className="space-y-2 rounded-lg border p-3">
          <strong>Organize o imóvel</strong>
          <p className="text-muted-foreground">
            Cadastre o imóvel, selecione o proprietário e defina o responsável. Use o código do
            imóvel na busca para encontrá-lo depois.
          </p>
          {onCreate && (
            <Button variant="outline" size="sm" onClick={onCreate}>
              Cadastrar imóvel
            </Button>
          )}
        </li>
        <li className="space-y-2 rounded-lg border p-3">
          <strong>Registre a negociação e o contrato</strong>
          <p className="text-muted-foreground">
            No cartão do imóvel, abra “Interessados e visitas” e depois “Propostas e negociações”.
            Uma proposta aceita permite registrar o contrato.
          </p>
        </li>
        <li className="space-y-2 rounded-lg border p-3">
          <strong>Acompanhe os valores</strong>
          <p className="text-muted-foreground">
            Em “Comissões e repasses”, crie o demonstrativo no contrato correto. Confirme o
            recebimento e o repasse somente após cada operação e exporte a planilha para prestar
            contas.
          </p>
          <Button variant="outline" size="sm" onClick={onSettlements}>
            Abrir demonstrativos
          </Button>
        </li>
      </ol>
      <p className="mt-3 text-xs text-muted-foreground">
        Os botões de cadastro e confirmação dependem do seu perfil. A busca e a Central de
        Notificações ajudam a retomar as pendências.
      </p>
    </details>
  );
}
