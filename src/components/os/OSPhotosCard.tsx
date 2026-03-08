import { useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Camera, ImageIcon, Upload, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import { logSOActivity } from '@/lib/so-activity-log';

interface Photo {
  id: string;
  photo_type: string;
  file_url: string;
  file_name?: string | null;
  created_at: string;
}

interface Props {
  orderId: string;
  photos: Photo[];
  photoUrls: Record<string, string>;
  canUploadFinalPhotos: boolean; // SINDICO with AAL2 or ZELADOR, only in EM_EXECUCAO or AGUARDANDO_APROVACAO
  onUploaded: () => void;
}

export function OSPhotosCard({ orderId, photos, photoUrls, canUploadFinalPhotos, onUploaded }: Props) {
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const problemPhotos = photos.filter((p) => p.photo_type === 'PROBLEMA');
  const finalPhotos = photos.filter((p) => p.photo_type === 'EXECUCAO_FINAL');

  const handleUploadFinalPhotos = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;

    const remaining = 5 - finalPhotos.length;
    if (files.length > remaining) {
      toast({ title: `Máximo de 5 fotos finais. Você pode adicionar mais ${remaining}.`, variant: 'destructive' });
      return;
    }

    setUploading(true);
    for (const file of files) {
      const ext = file.name.split('.').pop() ?? 'jpg';
      const path = `service-orders/${orderId}/${crypto.randomUUID()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('service-order-photos')
        .upload(path, file, { contentType: file.type });

      if (uploadError) {
        console.error('[OS upload] Final photo error:', uploadError);
        toast({ title: 'Erro ao enviar foto', description: uploadError.message, variant: 'destructive' });
        continue;
      }

      const { error: dbError } = await supabase
        .schema('nfe_vigia')
        .from('service_order_photos')
        .insert({
          service_order_id: orderId,
          photo_type: 'EXECUCAO_FINAL',
          file_url: path,
        });

      if (dbError) {
        console.error('[OS upload] DB error:', dbError);
      } else {
        await logSOActivity({ serviceOrderId: orderId, action: 'FOTO_ADICIONADA', description: 'Foto final adicionada' });
      }
    }

    toast({ title: 'Fotos finais enviadas com sucesso' });
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
    onUploaded();
  };

  const renderPhotoGrid = (items: Photo[]) => {
    if (items.length === 0) {
      return <p className="text-sm text-muted-foreground">Nenhuma foto.</p>;
    }
    return (
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
        {items.map((doc) => {
          const signedUrl = photoUrls[doc.id];
          if (!signedUrl) return null;
          return (
            <a key={doc.id} href={signedUrl} target="_blank" rel="noopener noreferrer">
              <img
                src={signedUrl}
                alt={doc.file_name ?? 'Foto'}
                className="h-24 w-full rounded-md object-cover border border-border hover:opacity-80 transition-opacity"
              />
            </a>
          );
        })}
      </div>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <ImageIcon className="h-4 w-4 text-muted-foreground" />
          Fotos
        </CardTitle>
        <CardDescription>{photos.length} foto(s) no total</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Problem photos */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Camera className="h-4 w-4 text-muted-foreground" />
            <h4 className="text-sm font-medium text-foreground">Fotos do Problema</h4>
            <span className="text-xs text-muted-foreground">({problemPhotos.length})</span>
          </div>
          {renderPhotoGrid(problemPhotos)}
        </div>

        {/* Final photos */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Camera className="h-4 w-4 text-muted-foreground" />
            <h4 className="text-sm font-medium text-foreground">Fotos da Execução Final</h4>
            <span className="text-xs text-muted-foreground">({finalPhotos.length}/5)</span>
          </div>
          {renderPhotoGrid(finalPhotos)}

          {canUploadFinalPhotos && finalPhotos.length < 5 && (
            <div className="mt-3">
              <Input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleUploadFinalPhotos}
                disabled={uploading}
                className="hidden"
                id="final-photos-input"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                <Upload className="h-4 w-4 mr-1" />
                {uploading ? 'Enviando...' : `Adicionar fotos finais (${5 - finalPhotos.length} restante(s))`}
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
