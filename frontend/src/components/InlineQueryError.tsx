import Alert from "@/components/Alert";
import Button from "@/components/Button";

type InlineQueryErrorProps = {
  message: string;
  onRetry: () => void;
  retryLabel?: string;
};

export default function InlineQueryError({ message, onRetry, retryLabel = "Try again" }: InlineQueryErrorProps) {
  return (
    <Alert>
      <p>{message}</p>
      <Button variant="outline" onClick={onRetry} className="mt-3">
        {retryLabel}
      </Button>
    </Alert>
  );
}
