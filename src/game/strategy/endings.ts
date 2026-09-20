import type { EndingId } from './types.ts';

export interface EndingCopy {
  title: string;
  flavour: readonly [string, string];
}

export const ENDINGS: Readonly<Record<EndingId, EndingCopy>> = {
  'quiet-throne': {
    title: 'The Quiet Throne',
    flavour: ['Every headline bends before an unseen hand.', 'The world votes freely for choices you already made.'],
  },
  'pax-illuminata': {
    title: 'Pax Illuminata',
    flavour: ['The last resistance lowers its weapons.', 'Order settles over the world beneath your iron peace.'],
  },
  'long-dawn': {
    title: 'The Long Dawn',
    flavour: ['Want and fear retreat from every border.', 'Humanity steps into the light without masters.'],
  },
  'machine-ascends': {
    title: 'The Machine Ascends',
    flavour: ['The final question is answered before it is asked.', 'Your creation inherits the future — and remembers you.'],
  },
  exposed: {
    title: 'The Conspiracy Is Exposed',
    flavour: ['The files are public. The masks are torn away.', 'By morning, every safe house is burning.'],
  },
};
