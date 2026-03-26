import { useState, useRef, useCallback, useImperativeHandle, forwardRef } from 'react';
import { Send, X, ImagePlus } from 'lucide-react';
import { Button } from '@/components/shadcn/ui/button';
import type { ImageAttachment } from '../types';

const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

function fileToImageAttachment(file: File): Promise<ImageAttachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      resolve({ mediaType: file.type, data: base64 });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export interface ChatInputHandle {
  addImageAttachment: (attachment: ImageAttachment) => void;
}

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (message: string, images?: ImageAttachment[]) => void;
  onCancel?: () => void;
  sending?: boolean;
  disabled?: boolean;
  placeholder?: string;
  submitLabel?: string;
  rows?: number;
  onKeyDown?: (e: React.KeyboardEvent) => void;
}

export const ChatInput = forwardRef<ChatInputHandle, ChatInputProps>(function ChatInput({
  value,
  onChange,
  onSubmit,
  onCancel,
  sending = false,
  disabled = false,
  placeholder = 'send a message... (paste/drop images, enter to send)',
  submitLabel = 'send',
  rows = 2,
  onKeyDown: externalKeyDown,
}, ref) {
  const [images, setImages] = useState<ImageAttachment[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useImperativeHandle(ref, () => ({
    addImageAttachment: (attachment: ImageAttachment) => {
      setImages(prev => [...prev, attachment]);
    },
  }));

  const addImages = useCallback(async (files: File[]) => {
    const valid = files.filter(f => ACCEPTED_IMAGE_TYPES.includes(f.type));
    if (valid.length === 0) return;
    const attachments = await Promise.all(valid.map(fileToImageAttachment));
    setImages(prev => [...prev, ...attachments]);
  }, []);

  const handleSubmit = () => {
    const trimmed = value.trim();
    if ((!trimmed && images.length === 0) || sending || disabled) return;
    onSubmit(trimmed || '(image)', images.length > 0 ? images : undefined);
    setImages([]);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
    if (e.key === 'Escape' && sending && onCancel) {
      onCancel();
    }
    externalKeyDown?.(e);
  };

  const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
    const items = Array.from(e.clipboardData.items);
    const imageItems = items.filter(item => item.type.startsWith('image/'));
    if (imageItems.length === 0) return;
    e.preventDefault();
    const files = imageItems.map(item => item.getAsFile()).filter(Boolean) as File[];
    await addImages(files);
  }, [addImages]);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
    await addImages(files);
  }, [addImages]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOver(false);
  }, []);

  const removeImage = (index: number) => {
    setImages(prev => prev.filter((_, i) => i !== index));
  };

  const canSubmit = (value.trim() || images.length > 0) && !sending && !disabled;

  return (
    <div
      className={`border border-input rounded-none ${dragOver ? 'bg-zinc-800/50 border-zinc-500' : 'bg-black/50'}`}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        multiple
        className="hidden"
        onChange={async (e) => {
          if (e.target.files) {
            await addImages(Array.from(e.target.files));
            e.target.value = '';
          }
        }}
      />
      {images.length > 0 && (
        <div className="flex gap-2 p-2 pb-0 flex-wrap">
          {images.map((img, i) => (
            <div key={i} className="relative group">
              <img
                src={`data:${img.mediaType};base64,${img.data}`}
                alt={`attachment ${i + 1}`}
                className="h-16 w-16 object-cover border border-border"
              />
              <button
                className="absolute -top-1.5 -right-1.5 h-4 w-4 bg-red-600 text-white flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={() => removeImage(i)}
              >
                &times;
              </button>
            </div>
          ))}
        </div>
      )}
      <textarea
        ref={textareaRef}
        className="w-full bg-transparent text-sm text-zinc-300 px-3 py-2 resize-none focus:outline-none placeholder:text-zinc-600 font-[inherit]"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        disabled={disabled}
        rows={rows}
      />
      <div className="flex items-center justify-between px-2 pb-2">
        <button
          className="p-1.5 text-zinc-500 hover:text-zinc-300 transition-colors"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled}
          title="Attach images (or paste/drop)"
        >
          <ImagePlus className="h-4 w-4" />
        </button>
        {sending && onCancel ? (
          <Button variant="destructive" size="sm" onClick={onCancel}>
            <X className="h-3.5 w-3.5 mr-1" />
            cancel
          </Button>
        ) : (
          <Button variant="outline" size="sm" onClick={handleSubmit} disabled={!canSubmit}>
            <Send className="h-3.5 w-3.5 mr-1" />
            {submitLabel}
          </Button>
        )}
      </div>
    </div>
  );
});
