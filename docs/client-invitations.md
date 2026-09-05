# Convites de clientes

O Lambda Pulse não aceita mais senhas definidas por administradores. Um novo cliente é criado inativo e com `must_set_password = true`; a ativação ocorre somente depois que o destinatário comprova acesso ao e-mail e define a própria senha.

## Garantias

- Tokens possuem 256 bits de entropia e apenas o SHA-256 é persistido.
- O token viaja no fragmento `#token=` da URL, que não é enviado ao servidor web nem em cabeçalhos `Referer`.
- Cada convite expira em 72 horas e é aceito uma única vez.
- Reenvio revoga todos os convites anteriores do usuário.
- Aceite, troca de senha, ativação e consumo do convite ocorrem na mesma transação com bloqueio de linha.
- Clientes pendentes não autenticam, não entram na lista de e-mails MCP e não podem ser ativados manualmente.
- Administradores vinculados a empresa só gerenciam usuários do próprio tenant.
- Falhas de entrega são registradas sem expor respostas internas do provedor.
- A recuperação pública de nomes de empresas responde sempre da mesma forma; os nomes são enviados apenas ao e-mail cadastrado.

## Estados exibidos no painel

`pending`, `delivery_failed`, `expired`, `revoked`, `active` e `inactive`. Convites pendentes podem ser reenviados ou cancelados; reenvios geram um segredo novo.

## Endpoints

- `POST /auth/clients`: cria usuário pendente e envia convite.
- `POST /auth/clients/:clientId/invite`: revoga o convite anterior e envia outro.
- `POST /auth/invitations/inspect`: valida o segredo sem consumi-lo.
- `POST /auth/invitations/accept`: define senha, ativa o usuário, consome o segredo e inicia uma sessão.
- `POST /auth/companies/by-email`: envia os nomes por e-mail sem revelá-los na resposta pública.
