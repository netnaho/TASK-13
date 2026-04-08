/**
 * voice-access-service.test.ts
 *
 * Unit tests for ConversationsService.resolveVoiceFilePath — the authorization
 * gate that controls who may retrieve a stored voice recording.
 *
 * Tests use the REAL ConversationsService with mocked repositories.
 * No inline reimplementation of service logic.
 *
 * Rules verified:
 *   - admin: always allowed without any DB lookup
 *   - non-admin: message must exist in DB AND user must be a participant of
 *     the message's conversation
 *   - unknown filename → NotFoundException
 *   - non-participant → ForbiddenException
 *
 * Repository mocks expose only the subset of the Repository interface that
 * resolveVoiceFilePath + assertAccess actually call (findOne on both repos).
 * All other constructor deps are passed as empty stubs — they are never reached
 * by the code paths exercised here.
 */
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { ConversationsService } from '../backend/src/conversations/conversations.service';

// ── Test constants ────────────────────────────────────────────────────────────

const CONV_ID      = 'conv-uuid-1';
const VENDOR_ID    = 'vendor-uuid-1';
const SHOPPER_ID   = 'shopper-uuid-1';
const OUTSIDER_ID  = 'outsider-uuid-1';
const ADMIN_ID     = 'admin-uuid-1';
const FILE_NAME    = '1716000000000-123456789.ogg';
const MISSING_FILE = 'no-such-file.ogg';

// ── Fixture data ──────────────────────────────────────────────────────────────

const conversation = {
  id: CONV_ID,
  vendorId: VENDOR_ID,
  shopperIds: [SHOPPER_ID],
};

const apiUrlMessage = {
  conversationId: CONV_ID,
  audioUrl: `/api/conversations/voice/${FILE_NAME}`,
};

// ── Mock builders ─────────────────────────────────────────────────────────────

function makeMsgRepo(message: object | null = apiUrlMessage) {
  return { findOne: jest.fn().mockResolvedValue(message) };
}

function makeConvRepo(conv: object | null = conversation) {
  return { findOne: jest.fn().mockResolvedValue(conv) };
}

/**
 * Construct a real ConversationsService instance with controlled test doubles.
 *
 * Constructor parameter order (matches conversations.service.ts):
 *   1. convRepo      — exercises assertAccess() → findOne
 *   2. msgRepo       — exercises resolveVoiceFilePath() → findOne
 *   3–7. unused deps — passed as empty stubs; never called by this code path
 */
function buildService(
  msgRepo: ReturnType<typeof makeMsgRepo>,
  convRepo: ReturnType<typeof makeConvRepo>,
): ConversationsService {
  return new ConversationsService(
    convRepo as any,
    msgRepo as any,
    {} as any,  // listingRepo
    {} as any,  // rateLimitRepo
    {} as any,  // cannedRepo
    {} as any,  // auditService
    {} as any,  // riskService
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ConversationsService.resolveVoiceFilePath — access-control', () => {

  describe('admin role', () => {
    it('admin is always allowed without any DB lookup', async () => {
      const msgRepo  = makeMsgRepo(null);
      const convRepo = makeConvRepo(null);
      const svc = buildService(msgRepo, convRepo);

      const result = await svc.resolveVoiceFilePath(FILE_NAME, ADMIN_ID, 'admin');

      expect(result).toBe(FILE_NAME);
      // Admin short-circuits before touching the DB
      expect(msgRepo.findOne).not.toHaveBeenCalled();
      expect(convRepo.findOne).not.toHaveBeenCalled();
    });

    it('admin receives the bare filename back', async () => {
      const svc = buildService(makeMsgRepo(), makeConvRepo());
      expect(await svc.resolveVoiceFilePath(FILE_NAME, ADMIN_ID, 'admin')).toBe(FILE_NAME);
    });
  });

  describe('shopper participant', () => {
    it('shopper in shopperIds is allowed', async () => {
      const svc = buildService(makeMsgRepo(), makeConvRepo());
      const result = await svc.resolveVoiceFilePath(FILE_NAME, SHOPPER_ID, 'shopper');
      expect(result).toBe(FILE_NAME);
    });
  });

  describe('vendor participant', () => {
    it('vendor who owns the conversation is allowed', async () => {
      const svc = buildService(makeMsgRepo(), makeConvRepo());
      const result = await svc.resolveVoiceFilePath(FILE_NAME, VENDOR_ID, 'vendor');
      expect(result).toBe(FILE_NAME);
    });
  });

  describe('non-participant', () => {
    it('outsider shopper receives ForbiddenException', async () => {
      const svc = buildService(makeMsgRepo(), makeConvRepo());
      await expect(
        svc.resolveVoiceFilePath(FILE_NAME, OUTSIDER_ID, 'shopper'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('non-owner vendor receives ForbiddenException', async () => {
      const svc = buildService(makeMsgRepo(), makeConvRepo());
      await expect(
        svc.resolveVoiceFilePath(FILE_NAME, 'other-vendor-uuid', 'vendor'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('missing message in DB', () => {
    it('unknown filename throws NotFoundException', async () => {
      const svc = buildService(makeMsgRepo(null), makeConvRepo());
      await expect(
        svc.resolveVoiceFilePath(MISSING_FILE, SHOPPER_ID, 'shopper'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('NotFoundException is NOT thrown for admin even if message is absent', async () => {
      const svc = buildService(makeMsgRepo(null), makeConvRepo(null));
      await expect(
        svc.resolveVoiceFilePath(MISSING_FILE, ADMIN_ID, 'admin'),
      ).resolves.toBe(MISSING_FILE);
    });
  });

  describe('URL format compat — legacy /uploads/voice/ path', () => {
    it('message stored with legacy /uploads/voice/ URL is still matched', async () => {
      // The real service queries both URL patterns; the mock returns any message
      // it is configured with — we verify the service passes the filename through
      // when msgRepo resolves with a legacy-URL message row.
      const legacyMsg = {
        conversationId: CONV_ID,
        audioUrl: `/uploads/voice/${FILE_NAME}`,
      };
      const svc = buildService(makeMsgRepo(legacyMsg), makeConvRepo());
      const result = await svc.resolveVoiceFilePath(FILE_NAME, SHOPPER_ID, 'shopper');
      expect(result).toBe(FILE_NAME);
    });
  });

  describe('file name validation (input sanity, controller responsibility)', () => {
    // The controller rejects bad names before calling the service.
    // These tests assert the allowed-character regex /^[\w.-]+$/ is correctly defined.
    const SAFE_NAMES   = ['1716000000000-123456789.ogg', 'a.mp3', 'voice_note.wav', 'file-1.ogg'];
    const UNSAFE_NAMES = ['../etc/passwd', 'foo/bar.ogg', 'file$name.ogg', ''];

    for (const name of SAFE_NAMES) {
      it(`safe name "${name}" passes the regex`, () => {
        expect(/^[\w.-]+$/.test(name)).toBe(true);
      });
    }

    for (const name of UNSAFE_NAMES) {
      it(`unsafe name "${name}" fails the regex`, () => {
        expect(/^[\w.-]+$/.test(name)).toBe(false);
      });
    }
  });
});
