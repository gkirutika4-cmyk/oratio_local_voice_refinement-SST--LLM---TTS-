const FILLERS = new Set([
  "um", "uh", "erm", "like", "you know", "sort of", "kind of", 
  "actually", "basically", "literally", "i mean", "you see"
]);

export function countFillers(transcript) {
  const text = transcript.toLowerCase();
  const words = text.split(/\s+/);
  let count = 0;
  
  // Check single words
  for (let i = 0; i < words.length; i++) {
    const cleaned = words[i].replace(/[^\w']/g, "");
    if (FILLERS.has(cleaned)) {
      count++;
      continue; // Skip to avoid double-counting
    }
    
    // Check two-word phrases
    if (i < words.length - 1) {
      const twoWord = `${words[i]} ${words[i + 1]}`.replace(/[^\w'\s]/g, "").trim();
      if (FILLERS.has(twoWord)) {
        count++;
        i++; // Skip next word to avoid double-counting
      }
    }
  }
  
  return count;
}

export function wordsPerMinute(transcript, durationMs) {
  const words = transcript.trim().split(/\s+/).filter(Boolean).length || 1;
  const mins = Math.max(durationMs / 60000, 0.001);
  return Math.round(words / mins);
}

export function buildProsodyPlan(transcript, targetWpm = 150) {
  const sentences = transcript.replace(/\s+/g, " ").match(/[^.!?]+[.!?]?/g) || [transcript];
  const plan = [];
  
  for (const s of sentences) {
    const trimmed = s.trim();
    if (!trimmed) continue;
    
    // Split on commas for natural pauses, but preserve the commas in output
    const fragments = trimmed.split(",").map(f => f.trim()).filter(Boolean);
    const marked = fragments.map((frag, i) => ({ 
      text: i < fragments.length - 1 ? `${frag},` : frag,
      pause_ms_after: i < fragments.length - 1 ? 200 : 0 
    }));
    
    plan.push({ 
      sentence: trimmed, 
      fragments: marked, 
      pause_ms_after: 400 
    });
  }
  
  return { target_wpm: targetWpm, sentences: plan };
}

export function toSSML(text, plan) {
  if (!plan?.sentences?.length) return `<speak>${escapeXml(text)}</speak>`;
  
  let out = '<speak>';
  for (const s of plan.sentences) {
    for (const frag of s.fragments) {
      out += `${escapeXml(frag.text)}`;
      if (frag.pause_ms_after) {
        out += ` <break time="${frag.pause_ms_after}ms"/>`;
      }
    }
    if (s.pause_ms_after) {
      out += ` <break time="${s.pause_ms_after}ms"/>`;
    }
  }
  out += '</speak>';
  return out;
}

function escapeXml(s) {
  return s.replace(/[<>&'"]/g, c => ({
    '<': '&lt;',
    '>': '&gt;',
    '&': '&amp;',
    "'": '&apos;',
    '"': '&quot;'
  }[c]));
}