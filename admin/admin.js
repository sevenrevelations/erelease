import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'

const C = window.BLOBBY_CONFIG || {}
const $ = id => document.getElementById(id)

const configured =
  /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(String(C.SUPABASE_URL || '')) &&
  String(C.SUPABASE_PUBLISHABLE_KEY || '').length > 20 &&
  !String(C.SUPABASE_PUBLISHABLE_KEY).includes('YOUR_')

let supabase = null
let session = null
let licenses = []

if (configured) {
  supabase = createClient(
    C.SUPABASE_URL,
    C.SUPABASE_PUBLISHABLE_KEY,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    }
  )
}

const fmt = v =>
  v ? new Date(v).toLocaleString() : '—'

const el = (tag, cls = '', text = '') => {
  const n = document.createElement(tag)

  if (cls) n.className = cls
  if (text) n.textContent = text

  return n
}

function setLoginError(text) {
  $('loginError').textContent = text || ''
}

function setStatus(text) {
  $('dashboardStatus').textContent = text || ''
}

function expirationFromControls(prefix) {
  const value =
    $(prefix + 'Expiration').value

  if (value === 'keep') {
    return undefined
  }

  if (value === 'lifetime') {
    return {
      kind: 'lifetime'
    }
  }

  if (value === 'custom') {
    const raw =
      $(prefix + 'Custom').value

    if (!raw) {
      throw Error(
        'Choose an expiration date and time.'
      )
    }

    return {
      kind: 'fixed',
      expiresAt:
        new Date(raw).toISOString()
    }
  }

  return {
    kind: 'duration',
    days: Number(value),
    starts:
      $(prefix + 'Starts').value
  }
}

function syncExp(prefix) {
  const v =
    $(prefix + 'Expiration').value

  $(prefix + 'StartsWrap').hidden =
    !['1', '7', '30', '90'].includes(v)

  $(prefix + 'CustomWrap').hidden =
    v !== 'custom'
}


// =============================================================
// EDGE FUNCTION REQUEST
// =============================================================

async function edge(action, payload = {}) {
  if (!session?.access_token) {
    throw Error(
      'Your admin session has expired.'
    )
  }

  const res = await fetch(
    C.SUPABASE_URL.replace(/\/$/, '') +
      '/functions/v1/license-admin',
    {
      method: 'POST',

      headers: {
        'Content-Type':
          'application/json',

        'apikey':
          C.SUPABASE_PUBLISHABLE_KEY,

        'Authorization':
          'Bearer ' +
          session.access_token
      },

      body: JSON.stringify({
        action,
        ...payload
      }),

      cache: 'no-store'
    }
  )

  let body = {}

  try {
    body = await res.json()
  } catch {}

  if (res.status === 403) {
    throw Error(
      'This account is not authorized as a blobby.vip administrator.'
    )
  }

  if (
    !res.ok ||
    body.ok === false
  ) {
    const messages = {
      person_already_has_key:
        'That assigned person/name already has a license. Edit or reset the existing license instead of creating a second key.',

      invalid_expiration:
        'Choose a valid future expiration.',

      invalid_name:
        'Enter an assigned name.',

      expired:
        'This license has already expired and cannot be reactivated.',

      key_not_recoverable:
        'This key was created before View Key was enabled, so the original full key cannot be recovered.',

      key_decryption_failed:
        'The stored key could not be decrypted. Check the license encryption configuration.',

      not_found:
        'The license could not be found.'
    }

    throw Error(
      messages[body.code] ||
      body.code ||
      'Admin request failed.'
    )
  }

  return body
}


// =============================================================
// LOAD LICENSES
// =============================================================

async function loadLicenses() {
  setStatus(
    'Loading licenses…'
  )

  try {
    const r =
      await edge('list')

    licenses =
      r.licenses || []

    render()

    setStatus(
      `${licenses.length} license${licenses.length === 1 ? '' : 's'}.`
    )
  } catch (e) {
    setStatus(e.message)
  }
}


// =============================================================
// RENDER LICENSE CARDS
// =============================================================

function render() {
  const q =
    $('searchInput')
      .value
      .trim()
      .toLowerCase()

  const f =
    $('statusFilter').value

  const list =
    $('licenseList')

  list.replaceChildren()

  const rows =
    licenses.filter(
      x =>
        (
          f === 'all' ||
          x.status === f
        ) &&
        (
          !q ||
          String(
            x.assignedName || ''
          )
            .toLowerCase()
            .includes(q) ||
          String(
            x.keyHint || ''
          )
            .toLowerCase()
            .includes(q)
        )
    )

  if (!rows.length) {
    list.append(
      el(
        'div',
        'license-card',
        'No licenses match this view.'
      )
    )

    return
  }

  for (const x of rows) {
    const card =
      el(
        'article',
        'license-card'
      )

    const head =
      el(
        'div',
        'license-head'
      )

    const name =
      el(
        'div',
        'license-name',
        x.assignedName
      )

    const pill =
      el(
        'span',
        'pill ' + x.status,
        x.status
      )

    head.append(
      name,
      pill
    )

    const hint =
      el(
        'div',
        'key-hint',
        `BLOBBY-••••-••••-••••-${x.keyHint}`
      )

    const meta =
      el(
        'div',
        'license-meta'
      )

    const pairs = [
      [
        'Created',
        fmt(x.createdAt)
      ],

      [
        'Activated',
        fmt(x.activatedAt)
      ],

      [
        'Last verified',
        fmt(x.lastVerifiedAt)
      ],

      [
        'Expires',
        x.expiresAt
          ? fmt(x.expiresAt)
          : 'Lifetime'
      ],

      [
        'Installation',
        x.hasInstallation
          ? 'Registered'
          : 'Not registered'
      ]
    ]

    for (
      const [k, v] of pairs
    ) {
      const d =
        el('div')

      d.append(
        el(
          'strong',
          '',
          k
        ),

        document.createTextNode(v)
      )

      meta.append(d)
    }

    const notes =
      el(
        'div',
        'license-notes',
        x.notes ||
          'No admin notes.'
      )

    const actions =
      el(
        'div',
        'license-actions'
      )


    // EDIT

    const edit =
      el(
        'button',
        '',
        'Edit'
      )

    edit.onclick =
      () => openEdit(x)

    actions.append(edit)


    // AUDIT

    const audit =
      el(
        'button',
        '',
        'Audit'
      )

    audit.onclick =
      () => openAudit(x)

    actions.append(audit)


    // RESET INSTALLATION

    const reset =
      el(
        'button',
        '',
        'Reset installation'
      )

    reset.disabled =
      !x.hasInstallation ||
      [
        'revoked',
        'expired'
      ].includes(x.status)

    reset.onclick =
      () => resetInstall(x)

    actions.append(reset)


    // =========================================================
    // VIEW KEY
    //
    // Only displayed when the backend says this license has
    // an encrypted recoverable key.
    // =========================================================

    if (x.canViewKey) {
      const viewKey =
        el(
          'button',
          '',
          'View Key'
        )

      viewKey.onclick =
        () =>
          viewLicenseKey(x)

      actions.append(
        viewKey
      )
    }


    // =========================================================
    // REVOKE / REACTIVATE
    // =========================================================

    if (
      x.status ===
      'revoked'
    ) {
      const reactivate =
        el(
          'button',
          '',
          'Reactivate'
        )

      reactivate.onclick =
        () =>
          reactivateLicense(x)

      actions.append(
        reactivate
      )
    } else {
      const revoke =
        el(
          'button',
          'danger',
          'Revoke'
        )

      revoke.onclick =
        () =>
          revokeLicense(x)

      actions.append(
        revoke
      )
    }


    card.append(
      head,
      hint,
      meta,
      notes,
      actions
    )

    list.append(card)
  }
}


// =============================================================
// GENERATE DIALOG
// =============================================================

function openGenerate() {
  $('genName').value = ''
  $('genNotes').value = ''

  $('genExpiration').value =
    'lifetime'

  $('genStarts').value =
    'activation'

  $('genCustom').value = ''

  $('genError').textContent =
    ''

  syncExp('gen')

  $('generateDialog')
    .showModal()

  setTimeout(
    () =>
      $('genName').focus(),
    30
  )
}


// =============================================================
// EDIT DIALOG
// =============================================================

function openEdit(x) {
  $('editId').value =
    x.id

  $('editTitle').textContent =
    x.assignedName

  $('editName').value =
    x.assignedName

  $('editNotes').value =
    x.notes || ''

  $('editExpiration').value =
    'keep'

  $('editStarts').value =
    'activation'

  $('editCustom').value =
    ''

  $('editError').textContent =
    ''

  syncExp('edit')

  $('editDialog')
    .showModal()
}


// =============================================================
// VIEW FULL KEY
// =============================================================

async function viewLicenseKey(x) {
  try {
    const r =
      await edge(
        'view_key',
        {
          licenseId: x.id
        }
      )

    const key =
      String(r.key || '')

    if (!key) {
      throw Error(
        'The full key could not be retrieved.'
      )
    }

    const shouldCopy =
      confirm(
        `${x.assignedName}'s access key:\n\n${key}\n\nPress OK to copy this key to your clipboard.`
      )

    if (!shouldCopy) {
      return
    }

    try {
      await navigator.clipboard
        .writeText(key)

      alert(
        'Key copied to clipboard.'
      )
    } catch {
      prompt(
        'Copy the key below:',
        key
      )
    }
  } catch (e) {
    alert(e.message)
  }
}


// =============================================================
// RESET INSTALLATION
// =============================================================

async function resetInstall(x) {
  if (
    !confirm(
      `Reset the registered installation for ${x.assignedName}?\n\nThe same key can then be activated on a replacement installation.`
    )
  ) {
    return
  }

  try {
    await edge(
      'reset_installation',
      {
        licenseId: x.id
      }
    )

    await loadLicenses()
  } catch (e) {
    alert(e.message)
  }
}


// =============================================================
// REVOKE
// =============================================================

async function revokeLicense(x) {
  if (
    !confirm(
      `Revoke access for ${x.assignedName}?\n\nThe installation will lose access after its next required verification.`
    )
  ) {
    return
  }

  try {
    await edge(
      'revoke',
      {
        licenseId: x.id
      }
    )

    await loadLicenses()
  } catch (e) {
    alert(e.message)
  }
}


// =============================================================
// REACTIVATE
// =============================================================

async function reactivateLicense(x) {
  if (
    !confirm(
      `Reactivate the license for ${x.assignedName}?\n\nThe old installation binding will be cleared. The same access key can then be activated again.`
    )
  ) {
    return
  }

  try {
    await edge(
      'reactivate',
      {
        licenseId: x.id
      }
    )

    await loadLicenses()

    alert(
      `${x.assignedName}'s license has been reactivated.\n\nThey can now use the same access key to activate blobby.vip again.`
    )
  } catch (e) {
    alert(e.message)
  }
}


// =============================================================
// AUDIT
// =============================================================

async function openAudit(x) {
  $('auditTitle').textContent =
    x.assignedName

  $('auditList')
    .replaceChildren(
      el(
        'div',
        'muted',
        'Loading…'
      )
    )

  $('auditDialog')
    .showModal()

  try {
    const r =
      await edge(
        'audit',
        {
          licenseId: x.id
        }
      )

    const list =
      $('auditList')

    list.replaceChildren()

    for (
      const a of r.audit || []
    ) {
      const n =
        el(
          'div',
          'audit-item'
        )

      n.append(
        el(
          'strong',
          '',
          a.event_type
        ),

        el(
          'span',
          '',
          fmt(a.created_at)
        )
      )

      if (
        a.detail &&
        Object.keys(
          a.detail
        ).length
      ) {
        n.append(
          el(
            'div',
            'audit-detail',
            JSON.stringify(
              a.detail,
              null,
              2
            )
          )
        )
      }

      list.append(n)
    }

    if (
      !(r.audit || []).length
    ) {
      list.append(
        el(
          'div',
          'muted',
          'No audit events yet.'
        )
      )
    }
  } catch (e) {
    $('auditList')
      .replaceChildren(
        el(
          'div',
          'error',
          e.message
        )
      )
  }
}


// =============================================================
// LOGIN
// =============================================================

$('loginForm')
  .addEventListener(
    'submit',

    async e => {
      e.preventDefault()

      setLoginError('')

      if (!configured) {
        setLoginError(
          'Owner setup is incomplete. Configure ../config.js first.'
        )

        return
      }

      $('loginButton').disabled =
        true

      const {
        data,
        error
      } =
        await supabase.auth
          .signInWithPassword({
            email:
              $('email')
                .value
                .trim(),

            password:
              $('password')
                .value
          })

      $('loginButton').disabled =
        false

      if (error) {
        setLoginError(
          'Sign in failed. Check your administrator credentials.'
        )

        return
      }

      session =
        data.session

      await showDashboard()
    }
  )


// =============================================================
// LOGOUT
// =============================================================

$('logoutButton').onclick =
  async () => {
    await supabase.auth
      .signOut()

    session = null

    $('dashboard').hidden =
      true

    $('loginView').hidden =
      false
  }


// =============================================================
// BUTTON EVENTS
// =============================================================

$('generateButton').onclick =
  openGenerate

$('refreshButton').onclick =
  loadLicenses

$('searchInput').oninput =
  render

$('statusFilter').onchange =
  render

$('genExpiration').onchange =
  () => syncExp('gen')

$('editExpiration').onchange =
  () => syncExp('edit')

$('closeKey').onclick =
  () =>
    $('keyDialog').close()

$('closeAudit').onclick =
  () =>
    $('auditDialog').close()


// =============================================================
// COPY KEY AFTER GENERATION
// =============================================================

$('copyKey').onclick =
  async () => {
    try {
      await navigator.clipboard
        .writeText(
          $('generatedKey')
            .textContent
        )

      $('copyKey').textContent =
        'Copied'

      setTimeout(
        () =>
          $('copyKey')
            .textContent =
              'Copy key',
        1200
      )
    } catch {
      alert(
        'Copy failed. Select the key and copy it manually.'
      )
    }
  }


// =============================================================
// GENERATE FORM
// =============================================================

$('generateForm')
  .addEventListener(
    'submit',

    async e => {
      e.preventDefault()

      $('genError')
        .textContent = ''

      try {
        const expiration =
          expirationFromControls(
            'gen'
          )

        $('genSubmit').disabled =
          true

        const r =
          await edge(
            'generate',
            {
              assignedName:
                $('genName')
                  .value
                  .trim(),

              notes:
                $('genNotes')
                  .value
                  .trim(),

              expiration
            }
          )

        $('genSubmit').disabled =
          false

        $('generateDialog')
          .close()

        $('generatedKey')
          .textContent =
            r.key

        $('keyDialog')
          .showModal()

        await loadLicenses()
      } catch (err) {
        $('genSubmit').disabled =
          false

        $('genError')
          .textContent =
            err.message
      }
    }
  )


// =============================================================
// EDIT FORM
// =============================================================

$('editForm')
  .addEventListener(
    'submit',

    async e => {
      e.preventDefault()

      $('editError')
        .textContent = ''

      try {
        const payload = {
          licenseId:
            $('editId').value,

          assignedName:
            $('editName')
              .value
              .trim(),

          notes:
            $('editNotes')
              .value
              .trim()
        }

        const exp =
          expirationFromControls(
            'edit'
          )

        if (
          exp !== undefined
        ) {
          payload.expiration =
            exp
        }

        await edge(
          'update',
          payload
        )

        $('editDialog')
          .close()

        await loadLicenses()
      } catch (err) {
        $('editError')
          .textContent =
            err.message
      }
    }
  )


// =============================================================
// DASHBOARD
// =============================================================

async function showDashboard() {
  $('loginView').hidden =
    true

  $('dashboard').hidden =
    false

  $('adminEmail').textContent =
    session?.user?.email ||
    'Admin'

  await loadLicenses()
}


// =============================================================
// STARTUP
// =============================================================

;(async () => {
  if (!configured) {
    setLoginError(
      'Owner setup is incomplete. Configure ../config.js and the Supabase backend.'
    )

    return
  }

  const { data } =
    await supabase.auth
      .getSession()

  session =
    data.session

  supabase.auth
    .onAuthStateChange(
      (
        _event,
        newSession
      ) => {
        session =
          newSession
      }
    )

  if (session) {
    await showDashboard()
  }
})()
