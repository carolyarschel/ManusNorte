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
- [ ] Página: Agendamento (scheduling) de projetos hot/cold
- [x] Página: Ausências (listagem, criação, edição, remoção)

## Publicação
- [x] Checkpoint final e publicação
