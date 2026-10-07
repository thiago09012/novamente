import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';

import { WikilinkNodeView } from './WikilinkNodeView';

export const WikilinkNode = Node.create({
  name: 'wikilink',
  inline: true,
  group: 'inline',
  atom: true,
  selectable: false,
  draggable: false,

  addAttributes() {
    return {
      noteId: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-note-id'),
      },
      title: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-title') ?? element.textContent ?? '',
      },
      sourceId: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-source-id'),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-wikilink]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-wikilink': '',
        class: 'wikilink',
      }),
      HTMLAttributes['data-title'] ?? '',
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(WikilinkNodeView);
  },
});
