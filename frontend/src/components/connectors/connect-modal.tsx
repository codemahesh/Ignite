'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Eye, EyeOff, Loader2, AlertCircle, Shield } from 'lucide-react';
import type { ConnectorSpec } from '@/types/api';

interface ConnectModalProps {
  spec: ConnectorSpec | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConnect: (config: Record<string, string>, credentials: Record<string, string>) => Promise<boolean>;
  isConnecting: boolean;
  error: string | null;
}

export function ConnectModal({
  spec,
  open,
  onOpenChange,
  onConnect,
  isConnecting,
  error,
}: ConnectModalProps) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});

  // Reset values when modal opens with new spec
  const handleOpenChange = (newOpen: boolean) => {
    if (newOpen && spec) {
      // Initialize with default values
      const defaults: Record<string, string> = {};
      if (spec.default_url) {
        defaults['url'] = spec.default_url;
      }
      setValues(defaults);
      setShowSecrets({});
    }
    onOpenChange(newOpen);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!spec) return;

    // Split values into config (non-secret) and credentials (secret)
    const config: Record<string, string> = {};
    const credentials: Record<string, string> = {};

    spec.credential_fields.forEach((field) => {
      const value = values[field.name] || '';
      if (field.secret) {
        credentials[field.name] = value;
      } else {
        config[field.name] = value;
      }
    });

    const success = await onConnect(config, credentials);
    if (success) {
      handleOpenChange(false);
    }
  };

  const toggleShowSecret = (fieldName: string) => {
    setShowSecrets((prev) => ({ ...prev, [fieldName]: !prev[fieldName] }));
  };

  if (!spec) return null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Connect {spec.display_name}</DialogTitle>
            <DialogDescription>
              Enter your credentials to connect this data source.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {spec.credential_fields.map((field) => (
              <div key={field.name} className="space-y-2">
                <Label htmlFor={field.name}>{field.label}</Label>
                <div className="relative">
                  <Input
                    id={field.name}
                    type={field.secret && !showSecrets[field.name] ? 'password' : 'text'}
                    placeholder={field.placeholder}
                    value={values[field.name] || ''}
                    onChange={(e) =>
                      setValues((prev) => ({ ...prev, [field.name]: e.target.value }))
                    }
                    disabled={isConnecting}
                    className={field.secret ? 'pr-10' : ''}
                  />
                  {field.secret && (
                    <button
                      type="button"
                      onClick={() => toggleShowSecret(field.name)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      tabIndex={-1}
                    >
                      {showSecrets[field.name] ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  )}
                </div>
              </div>
            ))}

            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="flex items-start gap-2 text-xs text-muted-foreground">
              <Shield className="h-4 w-4 shrink-0 mt-0.5" />
              <p>
                Credentials are encrypted at rest and never shown again after saving.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={isConnecting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isConnecting}>
              {isConnecting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Validating...
                </>
              ) : (
                'Validate & Connect'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
