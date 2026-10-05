import { useCallback, useRef, useState } from 'react';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle
} from '@/components/ui/alert-dialog';


interface ConfirmOptions {
    title: string;
    description?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    tone?: "default" | "danger";
}

type Resolver = (ok: boolean) => void;


export function useConfirm() {
    const [open, setOpen] = useState(false);
    const [options, setOptions] = useState<ConfirmOptions>({title: ""});
    const resolver = useRef<Resolver | null>(null);

    const confirm = useCallback((options: ConfirmOptions) => {
        setOptions(options);
        setOpen(true);
        return new Promise<boolean>((resolve) => {
            resolver.current = resolve;
        })
    }, []);

    const settle = (ok: boolean) => {
        setOpen(false);
        resolver.current?.(ok);
        resolver.current = null;
    }

    const dialog = (
        <AlertDialog
            open={open}
            onOpenChange={(next) => {
                if (!next) settle(false);
            }}
        >
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>{options.title}</AlertDialogTitle>
                    {options.description && (
                        <AlertDialogDescription>{options.description}</AlertDialogDescription>
                    )}
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel onClick={() => settle(false)}>
                        {options.cancelLabel ?? "Huỷ"}
                    </AlertDialogCancel>
                    <AlertDialogAction
                        className={
                            options.tone === "danger"
                            ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            : undefined
                        }
                        onClick={() => settle(true)}
                    >
                        {options.confirmLabel ?? "Xác nhận"}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    )

    return {confirm, dialog};
}