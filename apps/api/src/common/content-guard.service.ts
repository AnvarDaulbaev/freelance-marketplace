import { Global, Injectable, Module } from '@nestjs/common';
import { screenContacts, ScreenResult } from '@fm/shared';
import { ContentSource, OrderStatus, Prisma } from '@prisma/client';

/** Same in every locale: the stored text is shared, the UI explains it. */
export const CONTACT_PLACEHOLDER = '[***]';

/**
 * While the order is funded and in work the parties may need to share e.g. a
 * staging login email, so contacts are only flagged. Before funding and after
 * the order ends they are masked: that is when deals leave the platform.
 */
export const FLAG_ONLY_STATUSES: OrderStatus[] = [
  OrderStatus.IN_PROGRESS, OrderStatus.SUBMITTED, OrderStatus.REVISION, OrderStatus.DISPUTED,
];

export interface Screened extends ScreenResult {
  original: string;
}

interface FlagMeta {
  userId: string;
  source: ContentSource;
  entityId: string;
  orderId?: string;
}

/** Detects contacts in user content, masks them and records a ContentFlag for moderators. */
@Injectable()
export class ContentGuardService {
  screen(text: string, mask = true): Screened {
    return { ...screenContacts(text, { mask, placeholder: CONTACT_PLACEHOLDER }), original: text };
  }

  /** Records one flag for all screened fields of an entity; no-op if nothing was found. */
  async flag(db: Prisma.TransactionClient, meta: FlagMeta, ...fields: Screened[]) {
    const hits = fields.filter((f) => f.matches.length);
    if (!hits.length) return;
    const matches = hits.flatMap((f) => f.matches.map((m) => ({ kind: m.kind, value: m.value })));
    await db.contentFlag.create({
      data: {
        ...meta,
        kinds: [...new Set(matches.map((m) => m.kind))],
        matches,
        original: hits.map((f) => f.original).join('\n\n'),
        masked: hits.some((f) => f.masked),
      },
    });
  }
}

@Global()
@Module({ providers: [ContentGuardService], exports: [ContentGuardService] })
export class ContentGuardModule {}
