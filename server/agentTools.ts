import { consultantDb, projectDb, absenceDb } from "./db";

const DAY_NAMES: Record<number, string> = {
  1: "Segunda", 2: "Terça", 3: "Quarta", 4: "Quinta", 5: "Sexta",
};

export const AGENT_TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "list_consultants",
      description:
        "Lista todos os consultores: nome, nível (junior/pleno/senior), se é líder (isLeader), " +
        "máximo de dias por semana (maxDays), restrições de dias (restrictions: 1=seg..5=sex) e notas.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "list_projects",
      description:
        "Lista projetos com id, sigla, cliente, status, datas, cadência e dias de visita. " +
        "Status: confirmed=em execução, hot=prospecto quente, cold=prospecto frio, archived=arquivado.",
      parameters: {
        type: "object",
        properties: {
          status: {
            type: "string",
            enum: ["all", "confirmed", "hot", "cold", "archived"],
            description: "Filtro de status. Omitir ou 'all' retorna todos.",
          },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_project_details",
      description:
        "Retorna detalhes completos de um projeto: alocações confirmadas (consultor + dia + role), " +
        "vagas por nível (levelSlots) e consultores fixos (pinnedSlots).",
      parameters: {
        type: "object",
        properties: {
          projectId: { type: "number", description: "ID do projeto" },
        },
        required: ["projectId"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_confirmed_allocation_map",
      description:
        "Visão geral de TODOS os consultores: dias comprometidos em projetos confirmados e dias livres. " +
        "Use para analisar disponibilidade geral antes de sugerir alocações.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_absences",
      description:
        "Retorna ausências planejadas (férias, licenças). " +
        "Passe consultantId para filtrar por consultor, ou omita para buscar todas.",
      parameters: {
        type: "object",
        properties: {
          consultantId: { type: "number", description: "ID do consultor (opcional)" },
        },
      },
    },
  },
];

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  switch (name) {
    case "list_consultants": {
      const consultants = await consultantDb.findAll();
      return consultants.map((c) => ({
        id: c.id,
        name: c.name,
        level: c.level,
        isLeader: c.isLeader,
        maxDays: c.maxDays,
        restrictions: c.restrictions,
        restrictionNames: (c.restrictions as number[]).map((d) => DAY_NAMES[d] ?? d),
        notes: c.notes,
      }));
    }

    case "list_projects": {
      const all = await projectDb.findAll();
      const status = args.status as string | undefined;
      const filtered = !status || status === "all" ? all : all.filter((p) => p.status === status);
      return filtered.map((p) => ({
        id: p.id,
        acronym: p.acronym,
        client: p.client,
        status: p.status,
        startDate: p.startDate,
        endDate: p.endDate,
        cadence: p.cadence,
        visitDays: p.visitDays,
        visitDayNames: (p.visitDays as number[]).map((d) => DAY_NAMES[d] ?? d),
        leaderConsultantId: p.leaderConsultantId,
      }));
    }

    case "get_project_details": {
      const projectId = Number(args.projectId);
      const project = await projectDb.findById(projectId);
      if (!project) return { error: `Projeto ${projectId} não encontrado` };

      const [allocs, lvSlots, pinSlots, consultants] = await Promise.all([
        projectDb.getAllocations(projectId),
        projectDb.getLevelSlots(projectId),
        projectDb.getPinnedSlots(projectId),
        consultantDb.findAll(),
      ]);
      const cMap = new Map(consultants.map((c) => [c.id, c.name]));

      return {
        project: {
          id: project.id,
          acronym: project.acronym,
          client: project.client,
          status: project.status,
          startDate: project.startDate,
          endDate: project.endDate,
          cadence: project.cadence,
          visitDays: project.visitDays,
        },
        allocations: allocs.map((a) => ({
          consultantId: a.consultantId,
          consultantName: cMap.get(a.consultantId) ?? "?",
          weekday: a.weekday,
          weekdayName: DAY_NAMES[a.weekday] ?? a.weekday,
          role: a.role,
        })),
        levelSlots: lvSlots.map((s) => ({
          level: s.level,
          isLeader: s.isLeader,
          daysPerWeek: s.daysPerWeek,
          preferredDays: s.visitDays,
          preferredDayNames: (s.visitDays as number[]).map((d) => DAY_NAMES[d] ?? d),
          assignedConsultantId: s.assignedConsultantId,
          assignedConsultantName: s.assignedConsultantId ? (cMap.get(s.assignedConsultantId) ?? "?") : null,
        })),
        pinnedSlots: pinSlots.map((s) => ({
          consultantId: s.consultantId,
          consultantName: cMap.get(s.consultantId) ?? "?",
          daysPerWeek: s.daysPerWeek,
          preferredDays: s.visitDays,
          preferredDayNames: (s.visitDays as number[]).map((d) => DAY_NAMES[d] ?? d),
        })),
      };
    }

    case "get_confirmed_allocation_map": {
      const [consultants, allProjects] = await Promise.all([
        consultantDb.findAll(),
        projectDb.findAll(),
      ]);
      const confirmed = allProjects.filter((p) => p.status === "confirmed");

      type DayEntry = {
        weekday: number;
        weekdayName: string;
        projectId: number;
        projectAcronym: string;
        cadence: string;
        role: string;
      };

      const map = new Map(
        consultants.map((c) => [
          c.id,
          {
            id: c.id,
            name: c.name,
            level: c.level,
            isLeader: c.isLeader,
            maxDays: c.maxDays,
            restrictions: c.restrictions as number[],
            committedDays: [] as DayEntry[],
            freeDays: [] as string[],
          },
        ]),
      );

      for (const p of confirmed) {
        const allocs = await projectDb.getAllocations(p.id);
        for (const a of allocs) {
          const entry = map.get(a.consultantId);
          if (entry) {
            entry.committedDays.push({
              weekday: a.weekday,
              weekdayName: DAY_NAMES[a.weekday] ?? String(a.weekday),
              projectId: p.id,
              projectAcronym: p.acronym,
              cadence: p.cadence,
              role: a.role,
            });
          }
        }
      }

      for (const entry of map.values()) {
        const weeklyBusy = new Set(
          entry.committedDays
            .filter((d) => d.cadence === "weekly")
            .map((d) => d.weekday),
        );
        entry.freeDays = [1, 2, 3, 4, 5]
          .filter((d) => !entry.restrictions.includes(d) && !weeklyBusy.has(d))
          .map((d) => DAY_NAMES[d]);
      }

      return Array.from(map.values());
    }

    case "get_absences": {
      const consultantId = args.consultantId != null ? Number(args.consultantId) : null;
      return consultantId
        ? absenceDb.findByConsultant(consultantId)
        : absenceDb.findAll();
    }

    default:
      return { error: `Ferramenta desconhecida: ${name}` };
  }
}
