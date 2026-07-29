# Lambda Pulse - Gerenciador de AWS Lambda

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D20-green.svg)
![Vue](https://img.shields.io/badge/vue-3.x-emerald.svg)

**Lambda Pulse** é o portal de acompanhamento de automações da Chave Mestra. Clientes podem solicitar melhorias, acompanhar análise de viabilidade, posição na fila, desenvolvimento, validação e entregas, além de consultar métricas, logs e documentações das integrações ativas.

## 🚀 Tecnologias

O projeto é estruturado como um monorepo contendo backend e frontend:

### Backend (`/backend`)
- **Runtime**: Node.js
- **Framework**: Express.js
- **Banco de Dados**: PostgreSQL
- **Cache**: Redis
- **Infraestrutura**: AWS SDK (Lambda, CloudWatch, CloudWatch Logs)
- **Email**: Resend
- **Autenticação**: JWT & Bcrypt

### Frontend (`/frontend`)
- **Framework**: Vue 3
- **Build Tool**: Vite
- **Estilização**: Tailwind CSS v4
- **State Management**: Pinia
- **Router**: Vue Router
- **Charts**: Chart.js

---

## 🛠️ Pré-requisitos

Antes de começar, certifique-se de ter instalado:
- **Node.js** (v20 ou superior)
- **Docker** (para rodar PostgreSQL e Redis localmente, se preferir)
- **Conta AWS** com credenciais configuradas (para acesso às Lambdas)

---

## 📦 Instalação e Configuração

### 1. Backend

1.  Acesse a pasta do backend:
    ```bash
    cd backend
    ```

2.  Instale as dependências:
    ```bash
    npm install
    ```

3.  Configure as variáveis de ambiente:
    Copie o arquivo `.env.example` para `.env` e preencha com suas credenciais:
    ```bash
    cp .env.example .env
    ```

4.  Inicie o servidor de desenvolvimento:
    ```bash
    npm run dev
    ```

    O comando aplica o schema do PostgreSQL automaticamente antes de iniciar o servidor.

### 2. Frontend

1.  Acesse a pasta do frontend:
    ```bash
    cd frontend
    ```

2.  Instale as dependências:
    ```bash
    npm install
    ```

3.  Configure as variáveis de ambiente:
    Copie o arquivo `.env.example` para `.env`:
    ```bash
    cp .env.example .env
    ```

4.  Inicie o servidor de desenvolvimento:
    ```bash
    npm run dev
    ```

---

## ☁️ Implantação (Deployment)

Este projeto está configurado para ser implantado facilmente utilizando **Nixpacks**, que detecta automaticamente o ambiente e gera uma imagem OCI otimizada.

- **Backend**: Configurado via `nixpacks.toml` para usar Node 20.
- **Frontend**: Configurado via `nixpacks.toml` para buildar com Vite e servir os arquivos estáticos.

No backend, o Nixpacks executa `npm start`. O ciclo `prestart` roda `npm run db:migrate`
antes da API, dentro de uma transação protegida por advisory lock do PostgreSQL. Se a
migração falhar, a API não inicia com um schema incompatível.

## 🔄 Processos e automações

- Solicitações de clientes entram como `Recebida`, com SLA de análise de até 48h úteis.
- O administrador define complexidade, prioridade, posição, estimativa e atualização visível.
- Uma automação pode estar ligada a vários processos e um processo pode reunir várias automações.
- Na criação ou edição de uma integração, o administrador pode selecionar processos existentes
  da mesma empresa ou criar um novo processo já vinculado.
- O cliente acessa a automação relacionada diretamente pelos detalhes do processo.
- Cada nova atualização administrativa é preservada em uma linha do tempo visível ao cliente.
- O cliente pode registrar tempo, frequência e pessoas envolvidas por atividade antes e depois da automação.
- A nova solicitação pode incluir uma linha de base operacional opcional, gravada atomicamente com o processo.
- O Lambda Pulse calcula horas mensais, pessoas equivalentes e redução de esforço sem perder o histórico das medições.

## 🧭 Mapeamentos de dados

- De-paras combinam documento Markdown, campos estruturados embutidos na mesma área, exemplos, regras e arquivos de referência.
- Versões publicadas e revisões de edição são controladas separadamente.
- Administradores configuram exatamente o que o cliente pode editar e quais validações bloqueiam uma publicação.
- Toda alteração relevante possui linha do tempo com autor, data, antes/depois e restauração auditável.
- Alterações do cliente entram em um fluxo visível de revisão e aceite pela equipe técnica.
- Importações criam documento, vínculos e anexo de forma atômica.
- Mapas vinculados aparecem diretamente no contexto da demanda em Processos.

O contrato completo está em [docs/MAPPINGS_MODULE.md](docs/MAPPINGS_MODULE.md).
O desenho integrado de Processos, Mapeamentos e Esforço Operacional está em [docs/PROCESSOS_E_MAPEAMENTOS.md](docs/PROCESSOS_E_MAPEAMENTOS.md).

---

## 🤝 Contribuindo

Contribuições são bem-vindas! Se você tiver sugestões ou encontrar bugs:

1.  Faça um Fork do projeto.
2.  Crie uma Branch para sua feature (`git checkout -b feature/MinhaFeature`).
3.  Faça o Commit (`git commit -m 'Adicionando nova feature'`).
4.  Faça o Push (`git push origin feature/MinhaFeature`).
5.  Abra um Pull Request.

---

## 📄 Licença

Este projeto está licenciado sob a Licença MIT - veja o arquivo [LICENSE](LICENSE) para mais detalhes.

---

<p align="center">
  Desenvolvido por <a href="https://github.com/MatheusLuisLorscheiter">Matheus Luis Lorscheiter</a>
</p>
