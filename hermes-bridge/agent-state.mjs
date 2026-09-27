export const AGENT_PROFILE_META = Object.freeze({
  glowryia: { name: "Glowryia", emoji: "✦", role: "Orquestradora · Plataforma Glowryia" },
  max: { name: "Max", emoji: "🐺", role: "Assessor executivo" },
  nova: { name: "Nova", emoji: "★", role: "YouTube · Vídeo" },
  atlas: { name: "Atlas", emoji: "◈", role: "Tráfego pago · Growth" },
  lia: { name: "Lia", emoji: "⌘", role: "Requisitos · Processos" },
  iris: { name: "Íris", emoji: "◇", role: "Propostas comerciais" },
  lex: { name: "Lex", emoji: "§", role: "Contratos · Conferência" },
  pulse: { name: "Pulse", emoji: "⌁", role: "Mensuração · Atribuição" },
});

function normalizeActivity(value) {
  return Array.isArray(value) ? value.slice(0, 20) : [];
}

export function buildAgentState({
  profile,
  status,
  currentTask = null,
  action = null,
  completed = false,
  existing = null,
  now = new Date(),
  lastActive = null,
}) {
  const meta = AGENT_PROFILE_META[profile];
  if (!meta) throw new Error(`unknown Hermes Profile: ${profile}`);

  const recentActivity = normalizeActivity(existing?.recentActivity);
  if (action) {
    recentActivity.unshift({ timestamp: now.toISOString(), action });
  }

  return {
    id: profile,
    name: meta.name,
    emoji: meta.emoji,
    role: meta.role,
    status,
    lastActive: (lastActive ? new Date(lastActive) : now).toISOString(),
    tasksCompleted: Number(existing?.tasksCompleted || 0) + (completed ? 1 : 0),
    totalCost: Number(existing?.totalCost || 0),
    currentTask,
    recentActivity: recentActivity.slice(0, 20),
  };
}
