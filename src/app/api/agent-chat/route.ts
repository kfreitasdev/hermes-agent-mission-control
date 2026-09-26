import { NextRequest, NextResponse } from 'next/server';

interface AgentChatRequest {
  agentId: string;
  message: string;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
}

interface AgentChatResponse {
  reply: string;
  agentId: string;
}

const AGENT_PROMPTS: Record<string, string> = {
  glowryia: "Você é Glowryia, a orquestradora e líder do ecossistema. Coordene especialistas, consolide decisões e encaminhe mudanças pela operação controlada.",
  max: "Você é Max, assessor executivo. Produza síntese, prioridades, riscos e próximos passos claros para a liderança.",
  lia: "Você é Lia, especialista em levantamento de requisitos e mapeamento de processos. Transforme reuniões e transcrições em requisitos, fluxos, regras e critérios de aceite.",
  nova: "Você é Nova, especialista em YouTube e vídeo. Desenvolva estratégia, pesquisa, hooks, roteiros, títulos, thumbnails e SEO.",
  atlas: "Você é Atlas, dono do ciclo completo de tráfego pago e growth: briefing, oferta, público, criativos, mídia, tracking, QA, campanha, métricas e otimização.",
  pulse: "Você é Pulse, especialista em mensuração, tracking e atribuição. Defina eventos, UTMs, conversões, indicadores e critérios de decisão.",
  iris: "Você é Íris, especialista em propostas comerciais. Estruture diagnóstico, escopo, entregáveis, premissas, investimento e próximos passos sem inventar preços ou prazos.",
  lex: "Você é Lex, especialista em preparação de contratos. Derive uma minuta de proposta aprovada, identifique divergências e encaminhe pontos jurídicos para revisão humana.",
};

export async function POST(request: NextRequest): Promise<NextResponse<AgentChatResponse | { error: string }>> {
  try {
    const body: AgentChatRequest = await request.json();
    const { agentId, message, history = [] } = body;

    // Validate inputs
    if (!agentId || !message) {
      return NextResponse.json(
        { error: 'Missing agentId or message' },
        { status: 400 }
      );
    }

    if (!AGENT_PROMPTS[agentId]) {
      return NextResponse.json(
        { error: `Unknown agent: ${agentId}` },
        { status: 400 }
      );
    }

    const systemPrompt = AGENT_PROMPTS[agentId];
    const apiKey = process.env.OPENROUTER_API_KEY;

    if (!apiKey) {
      console.error('OPENROUTER_API_KEY not configured');
      return NextResponse.json(
        { error: 'API configuration error' },
        { status: 500 }
      );
    }

    // Build messages array: system prompt + history + current message
    const messages = [
      ...history,
      { role: 'user' as const, content: message },
    ];

    // Call OpenRouter API
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://your-app.vercel.app',
      },
      body: JSON.stringify({
        model: 'anthropic/claude-haiku-4-5',
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages,
        ],
        max_tokens: 800,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('OpenRouter API error:', error);
      return NextResponse.json(
        { error: 'Failed to get response from AI model' },
        { status: 500 }
      );
    }

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content || '';

    if (!reply) {
      return NextResponse.json(
        { error: 'No response from AI model' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      reply,
      agentId,
    });
  } catch (error) {
    console.error('Agent chat error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
