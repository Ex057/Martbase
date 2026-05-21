/**
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SupersetClient, t } from '@superset-ui/core';
import { Button, Modal } from 'antd';
import getBootstrapData from 'src/utils/getBootstrapData';

const DEFAULT_IDLE_TIMEOUT_SECONDS = 3600;
const WARNING_BEFORE_EXPIRY_SECONDS = 300;
const ACTIVITY_EVENTS: Array<keyof WindowEventMap> = [
  'click',
  'keydown',
  'mousemove',
  'scroll',
  'touchstart',
];

const PUBLIC_PORTAL_PATH_PREFIXES = ['/superset/public', '/public'];

const isPublicPortalPath = (pathname: string) =>
  PUBLIC_PORTAL_PATH_PREFIXES.some(
    prefix => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

function isSessionManagedPath(pathname: string) {
  if (window.IS_PUBLIC_PAGE === true) return false;
  if (pathname.includes('/login') || pathname.includes('/logout')) return false;
  if (isPublicPortalPath(pathname) || pathname.includes('/public')) return false;
  return true;
}

function buildAppPath(path: string) {
  const rawRoot = getBootstrapData().common.application_root || '';
  const normalizedRoot =
    rawRoot === '/' ? '' : String(rawRoot).replace(/\/+$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${normalizedRoot}${normalizedPath}`;
}

function getPublicLandingPath() {
  return buildAppPath('/superset/public/');
}

function getLoginToPublicPath() {
  const publicPath = getPublicLandingPath();
  return `${buildAppPath('/login/')}?next=${encodeURIComponent(publicPath)}`;
}

function forceLogoutToPublic() {
  const loginToPublic = getLoginToPublicPath();
  const logoutUrl = `${buildAppPath('/logout/')}?next=${encodeURIComponent(loginToPublic)}`;
  try {
    window.sessionStorage.clear();
    window.localStorage.clear();
  } catch {
    // Ignore storage access errors and proceed with logout redirect.
  }
  window.location.replace(logoutUrl);
}

export default function SessionTimeoutManager() {
  const [showWarning, setShowWarning] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(WARNING_BEFORE_EXPIRY_SECONDS);
  const lastActivityRef = useRef(Date.now());
  const forcedExpiredRef = useRef(false);

  const timeoutSeconds = useMemo(() => {
    const confValue = Number(
      getBootstrapData().common.conf.SESSION_TIMEOUT_IDLE_SECONDS ||
        DEFAULT_IDLE_TIMEOUT_SECONDS,
    );
    return Number.isFinite(confValue) && confValue > 0
      ? confValue
      : DEFAULT_IDLE_TIMEOUT_SECONDS;
  }, []);
  const warningSeconds = useMemo(
    () => Math.max(10, Math.min(WARNING_BEFORE_EXPIRY_SECONDS, Math.floor(timeoutSeconds / 2))),
    [timeoutSeconds],
  );

  const markActivity = useCallback(() => {
    if (forcedExpiredRef.current) return;
    const { pathname } = window.location;
    if (!isSessionManagedPath(pathname)) return;
    lastActivityRef.current = Date.now();
    if (showWarning) {
      setShowWarning(false);
    }
  }, [showWarning]);

  const sendHeartbeat = useCallback(async () => {
    await SupersetClient.get({
      endpoint: '/api/v1/security/csrf_token/',
    });
  }, []);

  const expireSession = useCallback(() => {
    forcedExpiredRef.current = true;
    setShowWarning(false);
    forceLogoutToPublic();
  }, []);

  const continueSession = useCallback(async () => {
    try {
      await sendHeartbeat();
      forcedExpiredRef.current = false;
      lastActivityRef.current = Date.now();
      setShowWarning(false);
    } catch {
      expireSession();
    }
  }, [expireSession, sendHeartbeat]);

  useEffect(() => {
    const { pathname } = window.location;
    if (!isSessionManagedPath(pathname)) return undefined;

    const activityHandler = () => markActivity();
    ACTIVITY_EVENTS.forEach(eventName =>
      window.addEventListener(eventName, activityHandler, { passive: true }),
    );

    const tick = window.setInterval(() => {
      if (forcedExpiredRef.current) return;
      const now = Date.now();
      const elapsedSeconds = Math.floor((now - lastActivityRef.current) / 1000);
      const remaining = timeoutSeconds - elapsedSeconds;

      if (remaining <= 0) {
        expireSession();
        return;
      }

      if (remaining <= warningSeconds) {
        setSecondsLeft(remaining);
        setShowWarning(true);
      }
    }, 1000);

    return () => {
      ACTIVITY_EVENTS.forEach(eventName =>
        window.removeEventListener(eventName, activityHandler),
      );
      window.clearInterval(tick);
    };
  }, [expireSession, markActivity, timeoutSeconds, warningSeconds]);

  return (
    <>
      <Modal
        open={showWarning}
        closable={false}
        maskClosable={false}
        onCancel={() => setShowWarning(false)}
        title={t('Session expiring soon')}
        footer={[
          <Button
            key="logout"
            onClick={() => {
              forcedExpiredRef.current = true;
              forceLogoutToPublic();
            }}
          >
            {t('Log out now')}
          </Button>,
          <Button key="continue" type="primary" onClick={continueSession}>
            {t('Stay signed in')}
          </Button>,
        ]}
      >
        {t('Your session will expire in %s seconds due to inactivity.', String(secondsLeft))}
      </Modal>
    </>
  );
}
