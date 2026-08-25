const express = require("express");
const { Pool } = require("pg");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

const CLIENT_ID = process.env.NUVEMSHOP_CLIENT_ID;
const CLIENT_SECRET = process.env.NUVEMSHOP_CLIENT_SECRET;
const DATABASE_URL = process.env.DATABASE_URL;

/*
|--------------------------------------------------------------------------
| POSTGRESQL
|--------------------------------------------------------------------------
*/

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl:
    DATABASE_URL && DATABASE_URL.includes("localhost")
      ? false
      : { rejectUnauthorized: false }
});

async function prepararBanco() {
  if (!DATABASE_URL) {
    console.error("DATABASE_URL não configurada.");
    return;
  }

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS nuvemshop_stores (
        store_id BIGINT PRIMARY KEY,
        access_token TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    console.log("PostgreSQL conectado.");
    console.log("Tabela nuvemshop_stores pronta.");
  } catch (error) {
    console.error(
      "Erro ao preparar PostgreSQL:",
      error.message
    );
  }
}

/*
|--------------------------------------------------------------------------
| STAGE 72
|--------------------------------------------------------------------------
*/

app.get("/", (req, res) => {
  res.status(200).send(`
    <html>
      <head>
        <title>STAGE 72</title>
      </head>
      <body style="
        margin:0;
        background:#070707;
        color:#63ddff;
        font-family:Arial,sans-serif;
        display:flex;
        align-items:center;
        justify-content:center;
        min-height:100vh;
      ">
        <div style="text-align:center;">
          <h1>STAGE 72</h1>
          <p>Backend online.</p>
        </div>
      </body>
    </html>
  `);
});

/*
|--------------------------------------------------------------------------
| HEALTH CHECK
|--------------------------------------------------------------------------
*/

app.get("/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");

    res.json({
      ok: true,
      service: "stage72-contador",
      database: true
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      service: "stage72-contador",
      database: false
    });
  }
});

/*
|--------------------------------------------------------------------------
| OAUTH NUVEMSHOP
|--------------------------------------------------------------------------
*/

app.get("/auth/callback", async (req, res) => {
  const code = req.query.code;

  console.log("Callback OAuth recebido.");

  if (req.query.error) {
    console.error(
      "Erro recebido no callback:",
      req.query.error
    );

    console.error(
      "Descrição do callback:",
      req.query.error_description || "sem descrição"
    );

    return res.status(400).send(
      "A Nuvemshop não autorizou a conexão."
    );
  }

  if (!code) {
    return res.status(400).send(
      "Código de autorização não recebido."
    );
  }

  if (!CLIENT_ID || !CLIENT_SECRET) {
    console.error(
      "Credenciais da Nuvemshop não configuradas."
    );

    return res.status(500).send(
      "Credenciais da integração não configuradas."
    );
  }

  try {
    console.log("Código OAuth recebido.");
    console.log("Solicitando access token...");

    const response = await fetch(
      "https://www.tiendanube.com/apps/authorize/token",
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json"
        },

        body: JSON.stringify({
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
          grant_type: "authorization_code",
          code: code
        })
      }
    );

    const data = await response.json();

    console.log(
      "Status HTTP OAuth:",
      response.status
    );

    console.log(
      "Campos retornados pela Nuvemshop:",
      Object.keys(data)
    );

    /*
    |--------------------------------------------------------------------------
    | ERRO OAUTH
    |--------------------------------------------------------------------------
    */

    if (!response.ok || data.error) {
      console.error(
        "Erro OAuth:",
        data.error || "erro_sem_nome"
      );

      console.error(
        "Descrição OAuth:",
        data.error_description || "sem descrição"
      );

      return res.status(500).send(`
        <html>
          <body style="
            margin:0;
            background:#070707;
            color:#ff6666;
            font-family:Arial,sans-serif;
            display:flex;
            align-items:center;
            justify-content:center;
            min-height:100vh;
          ">
            <div style="text-align:center;">
              <h1>STAGE 72</h1>
              <h2>FALHA NA AUTORIZAÇÃO</h2>
              <p>A Nuvemshop retornou um erro.</p>
            </div>
          </body>
        </html>
      `);
    }

    if (!data.access_token) {
      console.error(
        "Access token não retornado."
      );

      return res.status(500).send(
        "Access token não recebido."
      );
    }

    /*
    |--------------------------------------------------------------------------
    | STORE ID
    |--------------------------------------------------------------------------
    */

    const storeId =
      data.user_id ??
      data.store_id ??
      data.storeId ??
      null;

    if (!storeId) {
      console.error(
        "Store ID não retornado pela Nuvemshop."
      );

      return res.status(500).send(
        "ID da loja não recebido."
      );
    }

    /*
    |--------------------------------------------------------------------------
    | SALVA NO POSTGRESQL
    |--------------------------------------------------------------------------
    */

    await pool.query(
      `
        INSERT INTO nuvemshop_stores (
          store_id,
          access_token,
          updated_at
        )
        VALUES ($1, $2, NOW())

        ON CONFLICT (store_id)

        DO UPDATE SET
          access_token = EXCLUDED.access_token,
          updated_at = NOW()
      `,
      [
        storeId,
        data.access_token
      ]
    );

    console.log(
      "Nuvemshop conectada com sucesso."
    );

    console.log(
      "Store ID:",
      storeId
    );

    console.log(
      "Autorização salva no PostgreSQL."
    );

    return res.status(200).send(`
      <html>
        <head>
          <title>STAGE 72 - Conectado</title>
        </head>

        <body style="
          margin:0;
          background:#070707;
          color:#63ddff;
          font-family:Arial,sans-serif;
          display:flex;
          align-items:center;
          justify-content:center;
          min-height:100vh;
        ">
          <div style="text-align:center;">

            <h1>STAGE 72</h1>

            <h2>LOJA CONECTADA</h2>

            <p>
              A integração com a Nuvemshop foi
              autorizada com sucesso.
            </p>

            <p>
              A autorização foi salva no banco de dados.
            </p>

          </div>
        </body>
      </html>
    `);

  } catch (error) {
    console.error(
      "Erro interno durante OAuth:",
      error.message
    );

    return res.status(500).send(
      "Erro interno ao conectar com a Nuvemshop."
    );
  }
});

/*
|--------------------------------------------------------------------------
| WEBHOOK DE PEDIDOS
|--------------------------------------------------------------------------
*/

app.post(
  "/webhooks/orders",
  (req, res) => {
    console.log(
      "Webhook de pedido recebido."
    );

    console.log(
      JSON.stringify(req.body, null, 2)
    );

    res.sendStatus(200);
  }
);

/*
|--------------------------------------------------------------------------
| LGPD
|--------------------------------------------------------------------------
*/

app.post(
  "/webhooks/lgpd/store-redact",
  (req, res) => {
    console.log(
      "LGPD store redact recebido."
    );

    res.sendStatus(200);
  }
);

app.post(
  "/webhooks/lgpd/customers-redact",
  (req, res) => {
    console.log(
      "LGPD customers redact recebido."
    );

    res.sendStatus(200);
  }
);

app.post(
  "/webhooks/lgpd/customers-data-request",
  (req, res) => {
    console.log(
      "LGPD customers data request recebido."
    );

    res.sendStatus(200);
  }
);

/*
|--------------------------------------------------------------------------
| LOTE STAGE 72
|--------------------------------------------------------------------------
*/

let lote = {
  current: 7,
  target: 10
};

app.get("/api/lote", (req, res) => {
  const remaining = Math.max(
    lote.target - lote.current,
    0
  );

  const percentage = Math.min(
    Math.round(
      (lote.current / lote.target) * 100
    ),
    100
  );

  res.json({
    current: lote.current,
    target: lote.target,
    remaining: remaining,
    percentage: percentage,
    closed: lote.current >= lote.target
  });
});

/*
|--------------------------------------------------------------------------
| STATUS
|--------------------------------------------------------------------------
*/

app.get("/api/status", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT store_id, updated_at
      FROM nuvemshop_stores
      ORDER BY updated_at DESC
      LIMIT 1
    `);

    if (result.rows.length === 0) {
      return res.json({
        ok: true,
        nuvemshopConnected: false,
        storeId: null
      });
    }

    res.json({
      ok: true,
      nuvemshopConnected: true,
      storeId: result.rows[0].store_id
    });

  } catch (error) {
    res.status(500).json({
      ok: false,
      database: false
    });
  }
});

/*
|--------------------------------------------------------------------------
| SERVIDOR
|--------------------------------------------------------------------------
*/

app.listen(
  PORT,
  "0.0.0.0",
  async () => {
    console.log(
      `STAGE 72 rodando na porta ${PORT}`
    );

    await prepararBanco();
  }
);
