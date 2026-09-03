const PARTICLE_FALLBACKS = new Map([
  ["1", "는"],
  ["2", "를"],
  ["3", "가"],
  ["4", "와"],
  ["5", "으"],
  ["6", "이"],
]);

const ONE_PARAMETER_COMMANDS = new Set([
  "Sbs", "Sve", "Svj", "Svp", "Sre", "Fw", "VF", "Ssp", "Fo", "VNMPID", "Fi", "b", "w", "l",
  "Srp", "Smp", "Sfp", "Sef", "Sst", "Ssc", "Ssm", "Sfm", "Sdu", "Spt", "Sse", "Scl", "Sct",
]);
const TWO_PARAMETER_COMMANDS = new Set(["Sbv", "Sbp", "Sls", "Slp"]);
const ZERO_PARAMETER_COMMANDS = ["Wc", "Wa", "Wv", "Wd", "N0", "N1", "t0", "t1", "a"];

export function parseMessageDocument(text) {
  const entries = [];
  const pattern = /^([^:\r\n]+):[ \t]?([^\r\n]*)/gm;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    entries.push({ key: match[1].replace(/^\uFEFF/, ""), value: match[2] });
  }
  return entries;
}

export function parseNameMap(text) {
  const names = new Map();
  for (const { key, value } of parseMessageDocument(text)) {
    if (key.startsWith("MPID_") && value.trim()) names.set(key.slice(5), stripCommands(value).trim());
  }
  return names;
}

export function canonicalCharacterId(value, names = new Map()) {
  if (!value) return "";
  const trimmed = value.trim();
  if (trimmed === "username" || trimmed.startsWith("プレイヤー")) return "プレイヤー";
  if (names.has(trimmed)) return trimmed;
  const routeNeutral = trimmed.replace(/[白黒透]$/, "");
  if (routeNeutral !== trimmed && names.has(routeNeutral)) return routeNeutral;
  return trimmed;
}

export function extractMainSupportKey(key, names = new Map()) {
  const match = key.match(/^MID_支援_(.+)_([ＣＢＡＳ])(?:_00)?$/u);
  if (!match) return null;
  const ids = match[1]
    .split("_")
    .filter((part) => part && !["親子", "恋人", "兄弟", "姉妹", "夫婦", "家族", "通常", "一般"].includes(part))
    .map((part) => canonicalCharacterId(part, names));
  if (ids.length < 2 || ids[0] === ids[1]) return null;
  return { characters: ids.slice(0, 2), rank: match[2], relationship: relationshipLabel(key) };
}

export function extractDlcSupportKey(key, names = new Map()) {
  const marker = key.match(/^MID_E\d+_(?:TK|EV)_(.+)$/u);
  if (!marker) return null;
  const tokens = marker[1].split("_");
  const characters = [];
  for (const token of tokens) {
    if (/^(?:\d+|PCM\d+|PCF\d+)$/u.test(token)) continue;
    const canonical = canonicalCharacterId(token, names);
    const known = names.has(canonical) || token === "username" || token.startsWith("プレイヤー");
    if (!known || characters.includes(canonical)) continue;
    characters.push(canonical);
    if (characters.length === 2) break;
  }
  return characters.length === 2 ? { characters, variant: dlcVariantLabel(key), relationship: relationshipLabel(key) } : null;
}

export function relationshipLabel(key) {
  const tokens = key.split("_");
  const has = (marker) => tokens.some((token) => token === marker || token === "プレイヤー" + marker);
  if (has("親子")) return "가족 · 부모·자녀";
  if (has("兄弟") || has("姉妹")) return "가족 · 형제·자매";
  if (has("夫婦")) return "부부";
  if (has("恋人")) return "연인";
  if (has("家族")) return "가족";
  return "일반";
}

export function dlcVariantLabel(key) {
  const gender = key.match(/_(PCM|PCF)(\d+)$/u);
  const part = key.replace(/_PC[MF]\d+$/u, "").match(/_0?(\d+)$/u);
  return [gender ? (gender[1] === "PCM" ? "남성" : "여성") : "", part ? `${Number(part[1])}편` : ""].filter(Boolean).join(" · ") || "회화";
}

export function isAllowedPlayerVariant(key, gameId) {
  const variant = key.match(/_(PC[MF]\d+)(?:_|$)/u)?.[1];
  return !variant || variant === "PCM1" || variant === (gameId === "awakening" ? "PCF1" : "PCF2");
}

export function isAllowedArchivePair(characters, gameId) {
  return !characters.includes("父親") && !(gameId === "awakening" && characters.includes("ルキナ"));
}

export function isAllowedArchiveSource(fileName, gameId) {
  return isAllowedArchivePair(fileName.replace(/\.txt$/u, "").split("_"), gameId);
}

export function parseScript(script, options = {}) {
  const playerId = options.playerId ?? "プレイヤー";
  const segments = [];
  const unknownCommands = [];
  let speaker = "";
  let emotion = "通常";
  let buffer = "";
  let index = 0;

  const flush = () => {
    const text = buffer.replace(/\n{3,}/g, "\n\n").trim();
    if (text) segments.push({ speaker: speaker || "나레이션", emotion, text });
    buffer = "";
  };

  while (index < script.length) {
    if (script.startsWith("\\n", index)) {
      buffer += "\n";
      index += 2;
      continue;
    }
    if (script[index] !== "$") {
      buffer += script[index++];
      continue;
    }

    const particle = script.slice(index).match(/^\$KrP([1-6])\|/u);
    if (particle) {
      buffer += PARTICLE_FALLBACKS.get(particle[1]);
      index += particle[0].length;
      continue;
    }
    if (script.startsWith("$Nu", index)) {
      buffer += "{{PLAYER_NAME}}";
      index += 3;
      continue;
    }
    if (script.startsWith("$G", index)) {
      const end = script.indexOf("|", index + 2);
      if (end !== -1) {
        const [male = "", female = ""] = script.slice(index + 2, end).split(",", 2);
        buffer += `{{G:${encodeURIComponent(male)}:${encodeURIComponent(female)}}}`;
        index = end + 1;
        continue;
      }
    }
    if (script.startsWith("$Ws", index)) {
      const end = script.indexOf("|", index + 3);
      if (end !== -1) {
        flush();
        speaker = canonicalCharacterId(script.slice(index + 3, end)) || playerId;
        if (speaker === "username") speaker = playerId;
        index = end + 1;
        continue;
      }
    }
    if (script.startsWith("$E", index)) {
      const end = script.indexOf("|", index + 2);
      if (end !== -1) {
        emotion = script.slice(index + 2, end).split(",", 1)[0] || "通常";
        index = end + 1;
        continue;
      }
    }
    if (script.startsWith("$Wm", index)) {
      const end = script.indexOf("|", index + 3);
      if (end !== -1) {
        index = end + 1;
        while (index < script.length && /[0-9-]/u.test(script[index])) index += 1;
        continue;
      }
    }
    if (script.startsWith("$k", index) || script.startsWith("$p", index)) {
      flush();
      index += 2;
      continue;
    }
    if (script.startsWith("$c", index)) {
      const end = script.indexOf("|", index + 2);
      index = end === -1 ? index + 2 : end + 1;
      continue;
    }

    const twoParameter = [...TWO_PARAMETER_COMMANDS].find((command) => script.startsWith(`$${command}`, index));
    if (twoParameter) {
      index = consumePipes(script, index + twoParameter.length + 1, 2);
      continue;
    }
    const oneParameter = [...ONE_PARAMETER_COMMANDS].find((command) => script.startsWith(`$${command}`, index));
    if (oneParameter) {
      index = consumePipes(script, index + oneParameter.length + 1, 1);
      continue;
    }
    const zeroParameter = ZERO_PARAMETER_COMMANDS.find((command) => script.startsWith(`$${command}`, index));
    if (zeroParameter) {
      index += zeroParameter.length + 1;
      continue;
    }

    const unknown = script.slice(index).match(/^\$([A-Za-z][A-Za-z0-9]*)/u);
    if (unknown) {
      unknownCommands.push(unknown[1]);
      const nextDollar = script.indexOf("$", index + 1);
      const nextPipe = script.indexOf("|", index + unknown[0].length);
      index = nextPipe !== -1 && (nextDollar === -1 || nextPipe < nextDollar)
        ? nextPipe + 1
        : index + unknown[0].length;
      continue;
    }

    unknownCommands.push("$");
    index += 1;
  }

  flush();
  return { segments, unknownCommands: [...new Set(unknownCommands)] };
}

export function stripCommands(script) {
  return parseScript(script).segments.map((segment) => segment.text).join(" ");
}

function consumePipes(script, from, count) {
  let index = from;
  for (let seen = 0; seen < count; seen += 1) {
    const end = script.indexOf("|", index);
    if (end === -1) return Math.max(from, index);
    index = end + 1;
  }
  return index;
}
