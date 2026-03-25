import json
import logging
import re

from django.conf import settings
import anthropic

logger = logging.getLogger(__name__)

NF_SYSTEM_PROMPT = """Você é um especialista em leitura de notas fiscais brasileiras (NF-e e NFS-e).
Analise esta nota fiscal e extraia as seguintes informações em JSON:
{
  "numero_nf": "número da nota fiscal",
  "data_emissao": "data no formato YYYY-MM-DD",
  "fornecedor": "nome do fornecedor/empresa emitente",
  "cnpj_fornecedor": "CNPJ do fornecedor",
  "valor_total": número decimal,
  "descricao_servico": "descrição do serviço ou produtos",
  "itens": [
    {"descricao": "nome do item", "quantidade": número, "valor_unitario": número, "valor_total": número}
  ]
}
Se não conseguir identificar algum campo, use string vazia ou 0. Responda APENAS com o JSON, sem texto adicional."""

RISK_SYSTEM_PROMPT = """Você é um especialista em análise de risco empresarial brasileiro.
Analise a empresa com os dados fornecidos e gere um relatório de risco.

Considere para a análise:
1. Situação cadastral na Receita Federal (Ativa/Baixada/Inapta/Suspensa)
2. Data de abertura da empresa (menos de 1 ano = risco maior)
3. Capital social (muito baixo = risco)
4. Porte da empresa
5. Natureza jurídica
6. CNAEs — verificar se são compatíveis com serviços condominiais
7. Quantidade de sócios e situação deles

Responda APENAS com JSON válido, sem markdown:
{
  "score": número de 0 a 100,
  "nivel_risco": "BAIXO" | "MEDIO" | "ALTO" | "CRITICO",
  "situacao_receita": "texto",
  "recomendacao": "APROVADO" | "ATENCAO" | "REPROVADO",
  "pontos_positivos": ["item1", "item2"],
  "pontos_atencao": ["item1", "item2"],
  "relatorio_resumido": "texto de 3-4 linhas explicando o risco",
  "relatorio_completo": "análise detalhada"
}"""

EMPTY_NF = {
    "numero_nf": "",
    "data_emissao": "",
    "fornecedor": "",
    "cnpj_fornecedor": "",
    "valor_total": 0,
    "descricao_servico": "",
    "itens": [],
}


def _get_client() -> anthropic.Anthropic:
    return anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)


def _parse_json_response(text: str):
    """Try to extract JSON from a Claude response that may include markdown fences."""
    match = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    raw = match.group(1).strip() if match else text.strip()
    return json.loads(raw)


def extract_nf(file_base64: str, media_type: str) -> dict:
    """Send a document/image to Claude for Brazilian invoice OCR extraction."""
    client = _get_client()

    is_pdf = media_type == "application/pdf"
    content_block = (
        {"type": "document", "source": {"type": "base64", "media_type": "application/pdf", "data": file_base64}}
        if is_pdf
        else {"type": "image", "source": {"type": "base64", "media_type": media_type, "data": file_base64}}
    )

    message = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=4096,
        messages=[
            {"role": "user", "content": [content_block, {"type": "text", "text": NF_SYSTEM_PROMPT}]},
        ],
    )

    text = message.content[0].text if message.content else ""
    try:
        return _parse_json_response(text)
    except (json.JSONDecodeError, AttributeError):
        logger.error("Failed to parse NF extraction response: %s", text[:500])
        return EMPTY_NF


def analyze_provider_risk(cnpj_data: dict) -> dict:
    """Send CNPJ data to Claude for AI-driven risk scoring."""
    client = _get_client()

    message = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=2048,
        system=RISK_SYSTEM_PROMPT,
        messages=[
            {"role": "user", "content": f"DADOS DA EMPRESA:\n{json.dumps(cnpj_data, indent=2, ensure_ascii=False)}"},
        ],
    )

    text = message.content[0].text if message.content else ""
    return _parse_json_response(text)
