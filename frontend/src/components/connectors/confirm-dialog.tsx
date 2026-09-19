'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  variant?: 'default' | 'destructive';
  onConfirm: () => void | Promise<void>;
  isLoading?: boolean;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancel',
  variant = 'default',
  onConfirm,
  isLoading = false,
}: ConfirmDialogProps) {
  const handleConfirm = async () => {
    await onConfirm();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            {cancelLabel}
          </Button>
          <Button
            variant={variant}
            onClick={handleConfirm}
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Please wait...
              </>
            ) : (
              confirmLabel
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Convenience components for common dialogs
interface DisableConnectorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  connectorName: string;
  onConfirm: () => void | Promise<void>;
  isLoading?: boolean;
}

export function DisableConnectorDialog({
  open,
  onOpenChange,
  connectorName,
  onConfirm,
  isLoading,
}: DisableConnectorDialogProps) {
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Disable ${connectorName}?`}
      description="Syncing stops. Already-ingested data stays in the graph and is still answerable."
      confirmLabel="Disable"
      onConfirm={onConfirm}
      isLoading={isLoading}
    />
  );
}

interface RemoveConnectorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  connectorName: string;
  artifactCount: number;
  onConfirm: () => void | Promise<void>;
  isLoading?: boolean;
}

export function RemoveConnectorDialog({
  open,
  onOpenChange,
  connectorName,
  artifactCount,
  onConfirm,
  isLoading,
}: RemoveConnectorDialogProps) {
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Remove ${connectorName}?`}
      description={`This permanently deletes ${artifactCount} artifacts and their graph nodes. This cannot be undone.`}
      confirmLabel="Remove"
      variant="destructive"
      onConfirm={onConfirm}
      isLoading={isLoading}
    />
  );
}
