# Lambda Client - Gerenciador de AWS Lambda

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D20-green.svg)
![Vue](https://img.shields.io/badge/vue-3.x-emerald.svg)

**Lambda Client** é uma plataforma moderna e open-source para gerenciamento e monitoramento de funções AWS Lambda em tempo real. Desenvolvido com foco em performance e experiência do usuário, o projeto oferece uma interface intuitiva para acompanhar métricas, logs e invocações.

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
