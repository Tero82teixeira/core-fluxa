# Plano de testes RLS

Em projeto Supabase descartável, aplicar migrations na ordem e criar usuários A1/A2 da organização A e B1 da B. Para clientes, processos, documentos, monitoramento, tarefas, membros e storage: confirmar CRUD permitido conforme papel dentro da própria organização e negar SELECT/INSERT/UPDATE/DELETE cruzados. Testar usuário sem membership, membership inativa, troca de workspace, IDs inexistentes e tentativa de forjar `organization_id`.

Executar também casos de owner/admin/editor/viewer, funções RPC e caminhos de storage. Registrar SQL, identidade JWT, resultado esperado/obtido e política responsável. O teste só aprova se nenhum dado da organização B aparecer para A e vice-versa.
