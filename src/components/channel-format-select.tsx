import { FORMATS } from "@/modules/content/formats";

type Channel = { id: string; displayName: string; kind: "social" | "email"; isActive: boolean };

/** Selector combinado canal + formato (valor "channelId|format"). */
export function ChannelFormatSelect({
  channels,
  name = "channelFormat",
  defaultValue,
}: {
  channels: Channel[];
  name?: string;
  defaultValue?: string;
}) {
  return (
    <select name={name} className="input" defaultValue={defaultValue} required>
      {channels
        .filter((c) => c.isActive)
        .map((c) => (
          <optgroup key={c.id} label={c.displayName}>
            {Object.entries(FORMATS[c.kind]).map(([format, label]) => (
              <option key={format} value={`${c.id}|${format}`}>
                {c.displayName} · {label}
              </option>
            ))}
          </optgroup>
        ))}
    </select>
  );
}
