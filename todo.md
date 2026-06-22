# NORTE — Plataforma de Alocação de Consultores

## Schema & Banco de Dados
- [x] Definir schema Drizzle (consultants, projects, allocations, pinned_slots, level_slots, absences)
- [x] Aplicar migrações SQL via webdev_execute_sql
- [x] Migrar dados do PostgreSQL para MySQL

## Backend (tRPC)
- [x] Router: consultants (list, getById, create, update, remove, busy)
- [x] Router: projects (list, getById, create, update, remove, setAllocations, clearAllocations)
- [x] Router: absences (list, listByConsultant, create, update, remove)
- [x] Router: simulation (run)
- [x] Router: scheduling (run)

## Frontend
- [x] Layout global com AppLayout e sidebar customizada
- [x] Sidebar com links para todas as seções e toggle de tema claro/escuro
- [x] Página: Calendário semanal de alocações com navegação por semana
- [x] Página: Consultores (listagem, criação, edição, remoção)
- [x] Página: Projetos (listagem, criação, edição, remoção, slots de alocação)
- [x] Página: Dashboard com visão geral de ocupação e status dos projetos
- [x] Página: Simulação de alocações automática
- [x] Página: Agendamento (scheduling) de projetos hot/cold
- [x] Página: Ausências (listagem, criação, edição, remoção)

## Publicação
- [x] Checkpoint final e publicação

## Correções Pós-Entrega
- [x] Restaurar layout, cores e estatísticas do dashboard para o design original
- [x] Garantir lógica de simulação idêntica ao original (primaryLeaderDays, loadMap, pickDays, getBlockedDays, simulateBatch com batchExisting e tentativa de datas alternativas)

## RECONSTRUÇÃO FIEL AO ORIGINAL (Opção B — reescrita completa)

### Base / Fundamentos
- [x] Portar globals.css original (cores #c0392b, fontes Montserrat/Inter, dark mode html.dark)
- [x] Portar tipos (src/types/index.ts)
- [x] Portar lib/domain.ts (STATUS_META, LEVEL_LABELS, CADENCE, detectConflicts, remainingCapacity)
- [x] Portar lib/holidays.ts (isWorkingDay)
- [x] Portar lib/api.ts (camada REST fetch /api)
- [x] Portar store/useAppStore.ts (Zustand)

### Layout / Navegação
- [x] Portar Sidebar fiel (logo NORTE, nav links, toggle tema na sidebar)
- [x] Portar AppLayout (app-shell, main-content, topbar) com wouter
- [x] Tema claro/escuro via html.dark + toggle na sidebar

### Páginas (fiéis ao original)
- [x] Dashboard (stat-cards, projeção capacidade, conflitos, gantt, export CSV)
- [x] Calendário semanal (cal-table, cal-chip, navegação semana, restrições)
- [x] Consultores (CRUD, níveis, dias máx, restrições, notas, líder)
- [x] Projetos (CRUD, status confirmed/hot/cold/archived, líder, slots, alocações)
- [x] Simulação (SchedulerTab unificado)
- [x] Settings (placeholder original)

### Backend (Express portado — só muda camada de banco PG -> MySQL)
- [x] Camada de banco MySQL (converter $1 -> ?, RETURNING, arrays, transações)
- [x] consultant repository/service/controller/routes
- [x] project repository/service/controller/routes
- [x] simulation service/controller/routes
- [x] scheduling service
- [x] absences module
- [x] Montar Express sob /api no servidor do WebDev

### Regra de simulação unificada (novo requisito)
- [x] Projetos confirmados/em andamento entram automaticamente na simulação (constraints)
- [x] Simulação calcula quais consultores podem ser alocados em novos projetos
- [x] Sugerir data mais próxima viável quando não couber na data pedida
- [x] Considerar confirmados + todos em simulação no cálculo

### Validação
- [x] Validar visualmente cada página vs. original
- [x] Corrigir todos os erros TypeScript (0 erros)
- [x] Salvar checkpoint e entregar

## Correções de Simulação (feedback do usuário)
- [x] Corrigir "Viável na data original" quando há issues bloqueantes (feasible deve respeitar o backend)
- [x] Separar issues (bloqueantes) de suggestions (informativas) na resposta REST
- [x] Regra: Júnior deve compartilhar pelo menos 1 dia de visita com um Pleno/Sênior
