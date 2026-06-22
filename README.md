# Alloc Platform

Plataforma de alocação de consultores em projetos.

## Arquitetura

```
alloc-platform/
├── src/                    # Frontend (Next.js)
│   ├── app/                # Páginas (App Router)
│   ├── components/         # UI components
│   ├── lib/                # Lógica de domínio (frontend)
│   ├── store/              # Estado global (Zustand)
│   └── types/              # TypeScript interfaces
│
└── backend/                # API (Express + PostgreSQL)
    └── src/
        ├── config/         # Env + database pool
        ├── database/       # Migrations + seed
        ├── modules/
        │   ├── consultants/  # CRUD consultores
        │   ├── projects/     # CRUD projetos + alocações
        │   └── simulation/   # Motor de simulação
        ├── middlewares/     # Error + validation (Zod)
        └── lib/            # Erros customizados
```

## Pré-requisitos

- **Node.js** v18.17+
- **PostgreSQL** instalado localmente

## Setup rápido

### 1. Criar o banco de dados

```bash
createdb alloc-platform
```

### 2. Backend

```bash
cd backend
npm install
npm run migrate    # cria as tabelas
npm run seed       # insere dados de exemplo
npm run dev        # inicia em http://localhost:3001
```

### 3. Frontend

```bash
# Na raiz do projeto (outra janela de terminal)
npm install
npm run dev        # inicia em http://localhost:3000
```

## API Endpoints

| Método | Rota | Descrição |
|--------|------|-----------|
| GET    | /api/health | Health check |
| GET    | /api/consultants | Lista consultores |
| POST   | /api/consultants | Cria consultor |
| GET    | /api/consultants/:id | Consultor por ID |
| PUT    | /api/consultants/:id | Atualiza consultor |
| DELETE | /api/consultants/:id | Remove consultor |
| GET    | /api/consultants/:id/busy | Dias ocupados do consultor |
| GET    | /api/projects | Lista projetos (com slots e alocações) |
| POST   | /api/projects | Cria projeto com slots |
| GET    | /api/projects/:id | Projeto completo por ID |
| PUT    | /api/projects/:id | Atualiza dados do projeto |
| DELETE | /api/projects/:id | Remove projeto |
| PUT    | /api/projects/:id/allocations | Define alocações (valida conflitos) |
| DELETE | /api/projects/:id/allocations | Limpa alocações |
| POST   | /api/simulation/:projectId | Roda simulação de alocação |

## Regra de negócio principal

**Um consultor só pode estar em 1 projeto por dia da semana.**

Essa regra é enforçada em duas camadas:
1. **Banco de dados** — constraint UNIQUE na tabela `allocations`
2. **Aplicação** — `setAllocations()` verifica conflitos antes de inserir, considerando cadência quinzenal alternada
