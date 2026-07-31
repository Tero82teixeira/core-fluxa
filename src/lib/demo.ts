/**
 * Interruptor único do modo de demonstração.
 *
 * DEMO_MODE = false  → operação real: autenticação obrigatória, rotas internas
 *                      protegidas, selo "Demonstração" oculto e nenhum dado
 *                      fictício nas telas operacionais.
 * DEMO_MODE = true   → preserva a demonstração antiga (dados em memória) para
 *                      testes internos. Os dois mundos nunca se misturam: em
 *                      modo real nada é lido de `demo-data`/`demo-store`.
 *
 * Esta constante não deve ser replicada: importe-a sempre deste arquivo.
 */
export const DEMO_MODE = false;
