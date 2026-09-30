import assert from "node:assert/strict";
import test from "node:test";

import { isEmailConfigured } from "./config";
import {
  buildManagerInviteTemplateModel,
  MANAGER_INVITE_TEMPLATE_ALIAS,
  sendManagerInviteEmail,
} from "./manager-invite";
import {
  resetPostmarkClientForTests,
  sendTemplatedEmail,
  sendTransactionalEmail,
} from "./send-transactional";

test("email is off when POSTMARK_SERVER_TOKEN is empty", () => {
  assert.equal(isEmailConfigured({}), false);
  assert.equal(isEmailConfigured({ POSTMARK_SERVER_TOKEN: "" }), false);
  assert.equal(isEmailConfigured({ POSTMARK_SERVER_TOKEN: "   " }), false);
  assert.equal(isEmailConfigured({ POSTMARK_SERVER_TOKEN: "server-token" }), true);
});

test("sendTransactionalEmail no-ops without a token and never calls a client", async () => {
  resetPostmarkClientForTests();
  let called = false;
  const result = await sendTransactionalEmail(
    {
      to: "manager@example.com",
      subject: "Hello",
      text: "Body",
    },
    {
      env: { POSTMARK_SERVER_TOKEN: "" },
      client: {
        sendEmail: async () => {
          called = true;
          return { MessageID: "should-not-send" };
        },
      },
    },
  );
  assert.deepEqual(result, { sent: false, reason: "not_configured" });
  assert.equal(called, false);
});

test("sendTransactionalEmail uses Postmark client when configured", async () => {
  resetPostmarkClientForTests();
  const result = await sendTransactionalEmail(
    {
      to: "manager@example.com",
      subject: "Hello",
      html: "<p>Body</p>",
      text: "Body",
      tag: "test",
    },
    {
      env: {
        POSTMARK_SERVER_TOKEN: "server-token",
        POSTMARK_FROM_EMAIL: "noreply@vssyl.com",
        POSTMARK_MESSAGE_STREAM: "outbound",
      },
      client: {
        sendEmail: async (message) => {
          assert.equal(message.From, "noreply@vssyl.com");
          assert.equal(message.To, "manager@example.com");
          assert.equal(message.Subject, "Hello");
          assert.equal(message.MessageStream, "outbound");
          assert.equal(message.Tag, "test");
          return { MessageID: "msg-123" };
        },
      },
    },
  );
  assert.deepEqual(result, { sent: true, messageId: "msg-123" });
});

test("sendTransactionalEmail maps Postmark failures without throwing", async () => {
  resetPostmarkClientForTests();
  const result = await sendTransactionalEmail(
    {
      to: "manager@example.com",
      subject: "Hello",
      text: "Body",
    },
    {
      env: { POSTMARK_SERVER_TOKEN: "server-token" },
      client: {
        sendEmail: async () => {
          throw new Error("Postmark unavailable");
        },
      },
    },
  );
  assert.deepEqual(result, {
    sent: false,
    reason: "send_failed",
    error: "Postmark unavailable",
  });
});

test("sendTemplatedEmail sends through Postmark template alias", async () => {
  resetPostmarkClientForTests();
  const result = await sendTemplatedEmail(
    {
      to: "manager@example.com",
      templateAlias: MANAGER_INVITE_TEMPLATE_ALIAS,
      templateModel: {
        facility_name: "Terrace View",
        login_url: "https://vssyl.com/login",
      },
      tag: "onboarding-manager-invite",
    },
    {
      env: {
        POSTMARK_SERVER_TOKEN: "server-token",
        POSTMARK_FROM_EMAIL: "noreply@vssyl.com",
      },
      client: {
        sendEmailWithTemplate: async (message) => {
          assert.equal(message.From, "noreply@vssyl.com");
          assert.equal(message.To, "manager@example.com");
          assert.equal(message.TemplateAlias, "onboarding-manager-invite");
          assert.deepEqual(message.TemplateModel, {
            facility_name: "Terrace View",
            login_url: "https://vssyl.com/login",
          });
          assert.equal(message.Tag, "onboarding-manager-invite");
          assert.equal(message.InlineCss, true);
          return { MessageID: "tmpl-1" };
        },
      },
    },
  );
  assert.deepEqual(result, { sent: true, messageId: "tmpl-1" });
});

test("manager invite uses branded template model fields", () => {
  const model = buildManagerInviteTemplateModel({
    facilityDisplayName: "Terrace View",
    loginUrl: "https://vssyl.com/login",
  });
  assert.deepEqual(model, {
    facility_name: "Terrace View",
    login_url: "https://vssyl.com/login",
  });
});

test("sendManagerInviteEmail uses the invite template alias", async () => {
  resetPostmarkClientForTests();
  const result = await sendManagerInviteEmail(
    {
      to: "manager@example.com",
      facilityDisplayName: "Terrace View",
      loginUrl: "https://vssyl.com/login",
    },
    {
      env: { POSTMARK_SERVER_TOKEN: "server-token" },
      client: {
        sendEmailWithTemplate: async (message) => {
          assert.equal(message.TemplateAlias, "onboarding-manager-invite");
          assert.deepEqual(message.TemplateModel, {
            facility_name: "Terrace View",
            login_url: "https://vssyl.com/login",
          });
          return { MessageID: "invite-1" };
        },
      },
    },
  );
  assert.deepEqual(result, { sent: true, messageId: "invite-1" });
});
