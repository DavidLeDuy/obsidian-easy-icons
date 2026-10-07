import {
  Plugin,
  EditorSuggest,
  EditorPosition,
  Editor,
  TFile,
  EditorSuggestContext,
  EditorSuggestTriggerInfo,
  getIconIds,
  setIcon,
  MarkdownPostProcessorContext,
} from 'obsidian';
import {
  ViewPlugin,
  ViewUpdate,
  Decoration,
  DecorationSet,
  EditorView,
  WidgetType,
  MatchDecorator,
} from '@codemirror/view';

interface IconSuggestion {
  name: string; // Clean icon ID e.g. "a-arrow-down"
  display: string; // e.g. ":a-arrow-down:" or "lucide:a-arrow-down"
  type: 'emoji' | 'lucide';
  value: string; // Clean icon ID (no 'lucide-' prefix) or Emoji character
}

// Sample Unicode emoji map
const EMOJI_MAP: Record<string, string> = {
  heart: '❤️',
  smile: '😄',
  check: '✅',
  fire: '🔥',
  star: '⭐',
  rocket: '🚀',
};

// --- CodeMirror 6 Widget for Live Preview Rendering ---
class LucideIconWidget extends WidgetType {
  constructor(readonly iconName: string) {
    super();
  }

  eq(other: LucideIconWidget) {
    return other.iconName === this.iconName;
  }

  toDOM() {
    const iconSpan = document.createElement('span');
    iconSpan.addClass('inline-lucide-icon');
    iconSpan.style.display = 'inline-flex';
    iconSpan.style.alignItems = 'center';
    iconSpan.style.verticalAlign = 'middle';

    // Render native Obsidian Lucide SVG
    setIcon(iconSpan, this.iconName);

    return iconSpan;
  }
}

// Decorator to find :lucide-iconName: or :iconName: patterns in Live Preview
const lucideMatcher = new MatchDecorator({
  regexp: /:(?:lucide-)?([a-zA-Z0-9_-]+):/g,
  decoration: (match) => {
    const rawIconName = match[1];
    const iconName = rawIconName.startsWith('lucide-') ? rawIconName.slice(7) : rawIconName;

    return Decoration.replace({
      widget: new LucideIconWidget(iconName),
    });
  },
});

// ViewPlugin to manage Live Preview decorations
const lucideLivePreviewPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = lucideMatcher.createDeco(view);
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged || update.selectionSet) {
        this.decorations = lucideMatcher.updateDeco(update, this.decorations);
      }
    }
  },
  {
    decorations: (v) => v.decorations,
  },
);

// --- Main Plugin Class ---
export default class IconShortcodePlugin extends Plugin {
  async onload() {
    // 1. Register editor suggest for autocomplete
    this.registerEditorSuggest(new IconSuggester(this));

    // 2. Register Markdown Post Processor for Reading View
    this.registerMarkdownPostProcessor((element: HTMLElement, context: MarkdownPostProcessorContext) => {
      this.replaceLucideShortcodes(element);
    });

    // 3. Register CodeMirror 6 Extension for Live Preview Mode
    this.registerEditorExtension([lucideLivePreviewPlugin]);
  }

  /**
   * Scans rendered text nodes for :lucide-name: or :name: shortcodes in Reading View
   */
  replaceLucideShortcodes(element: HTMLElement) {
    const shortcodeRegex = /:(?:lucide-)?([a-zA-Z0-9_-]+):/g;
    const walk = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null);
    let node: Node | null;

    const nodesToReplace: { textNode: Text; matches: RegExpExecArray[] }[] = [];

    while ((node = walk.nextNode())) {
      const textNode = node as Text;
      const matches: RegExpExecArray[] = [];
      let match;

      while ((match = shortcodeRegex.exec(textNode.nodeValue || '')) !== null) {
        matches.push(match);
      }

      if (matches.length > 0) {
        nodesToReplace.push({ textNode, matches });
      }
    }

    for (const { textNode, matches } of nodesToReplace) {
      const parent = textNode.parentNode;
      if (!parent) continue;

      let lastIdx = 0;
      const fullText = textNode.nodeValue || '';
      const fragment = document.createDocumentFragment();

      for (const match of matches) {
        let [fullMatch, rawIconName] = match;
        const matchIdx = match.index;

        const iconName = rawIconName.startsWith('lucide-') ? rawIconName.slice(7) : rawIconName;

        if (matchIdx > lastIdx) {
          fragment.appendChild(document.createTextNode(fullText.substring(lastIdx, matchIdx)));
        }

        const iconSpan = document.createElement('span');
        iconSpan.addClass('inline-lucide-icon');
        iconSpan.style.display = 'inline-flex';
        iconSpan.style.alignItems = 'center';
        iconSpan.style.verticalAlign = 'middle';

        setIcon(iconSpan, iconName);

        if (iconSpan.firstElementChild) {
          fragment.appendChild(iconSpan);
        } else {
          fragment.appendChild(document.createTextNode(fullMatch));
        }

        lastIdx = matchIdx + fullMatch.length;
      }

      if (lastIdx < fullText.length) {
        fragment.appendChild(document.createTextNode(fullText.substring(lastIdx)));
      }

      parent.replaceChild(fragment, textNode);
    }
  }
}

// --- Autocomplete Suggester Class ---
class IconSuggester extends EditorSuggest<IconSuggestion> {
  lucideIcons: string[];

  constructor(plugin: Plugin) {
    super(plugin.app);

    this.lucideIcons = getIconIds().map((id) => (id.startsWith('lucide-') ? id.slice(7) : id));
  }

  onTrigger(cursor: EditorPosition, editor: Editor, file: TFile): EditorSuggestTriggerInfo | null {
    const line = editor.getLine(cursor.line);
    const textBeforeCursor = line.substring(0, cursor.ch);

    const match = textBeforeCursor.match(/:([a-zA-Z0-9_+-]{2,})$/);
    if (!match) return null;

    return {
      start: { line: cursor.line, ch: match.index! },
      end: cursor,
      query: match[1].toLowerCase(),
    };
  }

  getSuggestions(context: EditorSuggestContext): IconSuggestion[] {
    const query = context.query;
    const suggestions: IconSuggestion[] = [];

    // 1. Search Emojis
    for (const [shortcode, emojiChar] of Object.entries(EMOJI_MAP)) {
      if (shortcode.toLowerCase().includes(query)) {
        suggestions.push({
          name: shortcode,
          display: `:${shortcode}:`,
          type: 'emoji',
          value: emojiChar,
        });
      }
    }

    // 2. Search Lucide Icons
    for (const iconId of this.lucideIcons) {
      if (iconId.toLowerCase().includes(query)) {
        suggestions.push({
          name: iconId,
          display: `lucide:${iconId}`,
          type: 'lucide',
          value: iconId,
        });
      }
    }

    return suggestions.slice(0, 30);
  }

  renderSuggestion(item: IconSuggestion, el: HTMLElement): void {
    el.addClass('icon-suggest-item');
    el.style.display = 'flex';
    el.style.alignItems = 'center';
    el.style.gap = '8px';

    const previewContainer = el.createSpan({ cls: 'icon-suggest-preview' });

    if (item.type === 'emoji') {
      previewContainer.textContent = item.value;
    } else {
      setIcon(previewContainer, item.value);
    }

    el.createSpan({ text: item.display });
  }

  selectSuggestion(item: IconSuggestion, evt: MouseEvent | KeyboardEvent): void {
    if (!this.context) return;

    const replacement = item.type === 'emoji' ? item.value : `:lucide-${item.value}:`;

    this.context.editor.replaceRange(replacement, this.context.start, this.context.end);
  }
}
