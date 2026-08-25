import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="dark"
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-apois-surface group-[.toaster]:text-white group-[.toaster]:border-apois-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-apois-muted",
          actionButton: "group-[.toast]:bg-apois-yellow group-[.toast]:text-apois-black",
          cancelButton: "group-[.toast]:bg-apois-surface-soft group-[.toast]:text-apois-muted",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
