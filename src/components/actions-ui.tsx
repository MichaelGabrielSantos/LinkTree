import { followAction, saveAction } from "@/app/actions";
import { buttonClass, primaryButtonClass } from "./ui";

export function FollowButton({
  targetType,
  targetId,
  following,
  next,
  label,
}: {
  targetType: "person" | "topic" | "proposition";
  targetId: string;
  following: boolean;
  next: string;
  label?: string;
}) {
  return (
    <form action={followAction}>
      <input type="hidden" name="targetType" value={targetType} />
      <input type="hidden" name="targetId" value={targetId} />
      <input type="hidden" name="intent" value={following ? "unfollow" : "follow"} />
      <input type="hidden" name="next" value={next} />
      <button type="submit" className={following ? buttonClass : primaryButtonClass} aria-pressed={following}>
        {following ? "✓ Seguindo" : `+ Seguir${label ? ` ${label}` : ""}`}
      </button>
    </form>
  );
}

export function SaveButton({ itemType, itemId, saved, next }: { itemType: "news" | "proposition"; itemId: string; saved: boolean; next: string }) {
  return (
    <form action={saveAction}>
      <input type="hidden" name="itemType" value={itemType} />
      <input type="hidden" name="itemId" value={itemId} />
      <input type="hidden" name="intent" value={saved ? "unsave" : "save"} />
      <input type="hidden" name="next" value={next} />
      <button
        type="submit"
        aria-pressed={saved}
        aria-label={saved ? "Remover dos salvos" : "Salvar"}
        className={`rounded-lg px-2.5 py-1 text-sm font-medium hover:bg-surface-2 ${saved ? "text-ink" : "text-ink-2"}`}
      >
        {saved ? "★ Salvo" : "☆ Salvar"}
      </button>
    </form>
  );
}
