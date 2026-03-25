import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface OSData {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  status: string;
  priority: string | null;
  created_at: string;
  created_by: string;
  executor_type: string | null;
  executor_name: string | null;
  execution_notes: string | null;
}

interface Activity {
  description: string | null;
  activity_type: string;
  created_at: string;
}

interface Material {
  name: string;
  quantity: number | null;
  unit: string | null;
  cost: number | null;
}

interface Approval {
  approver_role: string;
  decision: string;
  justification?: string | null;
  responded_at?: string | null;
  is_minerva?: boolean;
}

const statusLabel: Record<string, string> = {
  ABERTA: 'Aberta',
  EM_EXECUCAO: 'Em Execução',
  AGUARDANDO_APROVACAO: 'Aguardando Aprovação',
  FINALIZADA: 'Finalizada',
  CANCELADA: 'Cancelada',
};

const priorityLabel: Record<string, string> = {
  BAIXA: 'Baixa',
  MEDIA: 'Média',
  ALTA: 'Alta (Emergencial)',
};

const executorTypeLabel: Record<string, string> = {
  INTERNO: 'Equipe Interna',
  TERCEIRIZADO: 'Prestador Externo',
  EQUIPE_INTERNA: 'Equipe Interna',
  PRESTADOR_EXTERNO: 'Prestador Externo',
};

const roleLabel: Record<string, string> = {
  SUBSINDICO: 'Subsíndico',
  CONSELHO: 'Conselheiro',
  SINDICO: 'Síndico',
};

const decisionLabel: Record<string, string> = {
  aprovado: 'Aprovado',
  rejeitado: 'Rejeitado',
  neutro: 'Neutro',
  pendente: 'Pendente',
};

interface PhotoWithUrl {
  photo_type: string;
  signedUrl: string;
  observation?: string | null;
}

export async function generateOSPdfBlob(
  order: OSData,
  activities: Activity[],
  materials: Material[],
  condoName: string | null,
  photosWithUrls: PhotoWithUrl[],
  approvals: Approval[] = []
): Promise<Blob> {
  const doc = new jsPDF('p', 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15;
  let y = 15;

  const addText = (text: string, x: number, yPos: number, opts?: { fontSize?: number; bold?: boolean; color?: [number, number, number]; maxWidth?: number }) => {
    doc.setFontSize(opts?.fontSize ?? 10);
    doc.setFont('helvetica', opts?.bold ? 'bold' : 'normal');
    doc.setTextColor(...(opts?.color ?? [33, 37, 41]));
    doc.text(text, x, yPos, { maxWidth: opts?.maxWidth ?? pageWidth - 2 * margin });
  };

  const checkPageBreak = (needed: number) => {
    if (y + needed > doc.internal.pageSize.getHeight() - 15) {
      doc.addPage();
      y = 15;
    }
  };

  // Header
  addText('ORDEM DE SERVIÇO', margin, y, { fontSize: 16, bold: true });
  y += 6;
  addText(`OS #${order.id.slice(0, 8)}`, margin, y, { fontSize: 10, color: [108, 117, 125] });
  if (condoName) {
    const textWidth = doc.getTextWidth(condoName);
    doc.setFontSize(10);
    doc.setTextColor(108, 117, 125);
    doc.text(condoName, pageWidth - margin - textWidth, y);
  }
  y += 4;
  doc.setDrawColor(200, 200, 200);
  doc.line(margin, y, pageWidth - margin, y);
  y += 8;

  // General info
  addText('INFORMAÇÕES GERAIS', margin, y, { fontSize: 12, bold: true });
  y += 7;

  const infoRows = [
    ['Título', order.title],
    ['Status', statusLabel[order.status] ?? order.status],
    ['Prioridade', priorityLabel[order.priority ?? ''] ?? '—'],
    ['Executor', executorTypeLabel[order.executor_type ?? ''] ?? '—'],
    ['Local', order.location ?? '—'],
    ['Criada em', format(new Date(order.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })],
  ];

  autoTable(doc, {
    startY: y,
    head: [],
    body: infoRows,
    theme: 'plain',
    margin: { left: margin, right: margin },
    styles: { fontSize: 9, cellPadding: 2 },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 35, textColor: [108, 117, 125] },
      1: { cellWidth: 'auto' },
    },
  });
  y = (doc as any).lastAutoTable.finalY + 6;

  // Description
  if (order.description) {
    checkPageBreak(20);
    addText('DESCRIÇÃO', margin, y, { fontSize: 12, bold: true });
    y += 6;
    const lines = doc.splitTextToSize(order.description, pageWidth - 2 * margin);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(33, 37, 41);
    doc.text(lines, margin, y);
    y += lines.length * 4.5 + 6;
  }

  // Execution notes
  if (order.execution_notes) {
    checkPageBreak(20);
    addText('NOTAS DE EXECUÇÃO', margin, y, { fontSize: 12, bold: true });
    y += 6;
    const lines = doc.splitTextToSize(order.execution_notes, pageWidth - 2 * margin);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(lines, margin, y);
    y += lines.length * 4.5 + 6;
  }

  // Materials
  if (materials.length > 0) {
    checkPageBreak(20);
    addText('MATERIAIS UTILIZADOS', margin, y, { fontSize: 12, bold: true });
    y += 7;

    const matRows = materials.map((m) => [
      m.name,
      `${m.quantity ?? '—'} ${m.unit ?? ''}`.trim(),
      m.cost != null ? `R$ ${m.cost.toFixed(2)}` : '—',
    ]);
    const totalCost = materials.reduce((s, m) => s + (m.cost ?? 0), 0);
    if (totalCost > 0) {
      matRows.push(['Total', '', `R$ ${totalCost.toFixed(2)}`]);
    }

    autoTable(doc, {
      startY: y,
      head: [['Material', 'Qtde/Unidade', 'Custo']],
      body: matRows,
      theme: 'grid',
      margin: { left: margin, right: margin },
      styles: { fontSize: 9, cellPadding: 2.5 },
      headStyles: { fillColor: [33, 37, 41], textColor: [255, 255, 255], fontStyle: 'bold' },
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  }

  // Approvals
  if (approvals.length > 0) {
    checkPageBreak(20);
    addText('APROVAÇÕES', margin, y, { fontSize: 12, bold: true });
    y += 7;

    const approvalRows = approvals.map((a) => [
      roleLabel[a.approver_role] ?? a.approver_role,
      decisionLabel[a.decision] ?? a.decision,
      a.justification ?? '—',
      a.responded_at ? format(new Date(a.responded_at), 'dd/MM/yyyy HH:mm', { locale: ptBR }) : '—',
    ]);

    autoTable(doc, {
      startY: y,
      head: [['Papel', 'Decisão', 'Justificativa', 'Respondido em']],
      body: approvalRows,
      theme: 'grid',
      margin: { left: margin, right: margin },
      styles: { fontSize: 9, cellPadding: 2.5 },
      headStyles: { fillColor: [33, 37, 41], textColor: [255, 255, 255], fontStyle: 'bold' },
      columnStyles: { 0: { cellWidth: 30 }, 1: { cellWidth: 25 }, 3: { cellWidth: 35 } },
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  }

  // Timeline
  if (activities.length > 0) {
    checkPageBreak(20);
    addText('HISTÓRICO / LINHA DO TEMPO', margin, y, { fontSize: 12, bold: true });
    y += 7;

    const timeRows = activities.map((a) => [
      format(new Date(a.created_at), 'dd/MM/yyyy HH:mm', { locale: ptBR }),
      a.description ?? a.activity_type,
    ]);

    autoTable(doc, {
      startY: y,
      head: [['Data/Hora', 'Atividade']],
      body: timeRows,
      theme: 'striped',
      margin: { left: margin, right: margin },
      styles: { fontSize: 9, cellPadding: 2.5 },
      headStyles: { fillColor: [33, 37, 41], textColor: [255, 255, 255], fontStyle: 'bold' },
      columnStyles: { 0: { cellWidth: 38 } },
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  }

  // Photos
  const problemPhotos = photosWithUrls.filter((p) => p.photo_type === 'PROBLEMA');
  const finalPhotos = photosWithUrls.filter((p) => p.photo_type === 'EXECUCAO_FINAL');

  const addPhotoSection = async (title: string, items: PhotoWithUrl[]) => {
    if (items.length === 0) return;
    checkPageBreak(50);
    addText(title, margin, y, { fontSize: 12, bold: true });
    y += 7;

    const imgWidth = 55;
    const imgHeight = 40;
    let x = margin;

    for (const photo of items) {
      try {
        const response = await fetch(photo.signedUrl);
        const blob = await response.blob();
        const base64 = await blobToBase64(blob);

        checkPageBreak(imgHeight + 15);
        if (x + imgWidth > pageWidth - margin) {
          x = margin;
          y += imgHeight + (photo.observation ? 12 : 5);
          checkPageBreak(imgHeight + 15);
        }

        doc.addImage(base64, 'JPEG', x, y, imgWidth, imgHeight);

        if (photo.observation) {
          doc.setFontSize(7);
          doc.setTextColor(108, 117, 125);
          doc.setFont('helvetica', 'normal');
          const obsLines = doc.splitTextToSize(photo.observation, imgWidth);
          doc.text(obsLines, x, y + imgHeight + 3);
        }

        x += imgWidth + 5;
      } catch (e) {
        console.warn('Failed to add photo to PDF:', e);
      }
    }
    y += imgHeight + 15;
  };

  await addPhotoSection('FOTOS DO PROBLEMA', problemPhotos);
  await addPhotoSection('FOTOS DA EXECUÇÃO FINAL', finalPhotos);

  // Footer
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(
      `Gerado em ${format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })} · Página ${i}/${pageCount}`,
      pageWidth / 2,
      doc.internal.pageSize.getHeight() - 8,
      { align: 'center' }
    );
  }

  return doc.output('blob');
}

// Keep backward compat alias
export async function generateOSPdf(
  order: OSData,
  activities: Activity[],
  materials: Material[],
  condoName: string | null,
  photosWithUrls: PhotoWithUrl[]
) {
  const blob = await generateOSPdfBlob(order, activities, materials, condoName, photosWithUrls);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `OS-${order.id.slice(0, 8)}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
