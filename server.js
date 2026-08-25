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
| STAGE 72
|--------------------------------------------------------------------------
*/

const PRODUCT_ID = 362509901;
const TARGET = 10;

const API_BASE = "https://api.nuvemshop.com.br/v1";

const WEBHOOK_URL =
  "https://stage72-contador.onrender.com/webhooks/orders";

const WEBHOOK_EVENTS = [
  "order/created",
  "order/updated"
];

/*
|--------------------------------------------------------------------------
| POSTGRESQL
|--------------------------------------------------------------------------
*/

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl:
    DATABASE_URL &&
    DATABASE_URL.includes("localhost")
      ? false
      : { rejectUnauthorized: false }
});

/*
|--------------------------------------------------------------------------
| PREPARAR BANCO
|--------------------------------------------------------------------------
*/

async function prepararBanco() {
  try {
    /*
    |--------------------------------------------------------------------------
    | LOJAS AUTORIZADAS
    |--------------------------------------------------------------------------
    */

    await pool.query(`
      CREATE TABLE IF NOT EXISTS nuvemshop_stores (
        store_id BIGINT PRIMARY KEY,
        access_token TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    /*
    |--------------------------------------------------------------------------
    | LOTES
    |--------------------------------------------------------------------------
    */

    await pool.query(`
      CREATE TABLE IF NOT EXISTS lotes (
        id SERIAL PRIMARY KEY,
        store_id BIGINT,
        product_id BIGINT,
        nome TEXT NOT NULL,
        current_quantity INTEGER NOT NULL DEFAULT 0,
        target_quantity INTEGER NOT NULL DEFAULT 10,
        active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    /*
    Compatibilidade com versões antigas da tabela lotes.
    */

    await pool.query(`
      ALTER TABLE lotes
      ADD COLUMN IF NOT EXISTS store_id BIGINT
    `);

    await pool.query(`
      ALTER TABLE lotes
      ADD COLUMN IF NOT EXISTS product_id BIGINT
    `);

    /*
    |--------------------------------------------------------------------------
    | PEDIDOS PROCESSADOS
    |--------------------------------------------------------------------------
    */

    await pool.query(`
      CREATE TABLE IF NOT EXISTS pedidos_processados (
        order_id BIGINT PRIMARY KEY,
        store_id BIGINT,
        product_id BIGINT,
        quantity INTEGER NOT NULL DEFAULT 0,
        processed_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    /*
    IMPORTANTE:

    A tabela já existia no banco antes de adicionarmos
    store_id, product_id e quantity.

    CREATE TABLE IF NOT EXISTS não altera uma tabela existente,
    portanto garantimos as colunas abaixo.
    */

    await pool.query(`
      ALTER TABLE pedidos_processados
      ADD COLUMN IF NOT EXISTS store_id BIGINT
    `);

    await pool.query(`
      ALTER TABLE pedidos_processados
      ADD COLUMN IF NOT EXISTS product_id BIGINT
    `);

    await pool.query(`
      ALTER TABLE pedidos_processados
      ADD COLUMN IF NOT EXISTS quantity INTEGER NOT NULL DEFAULT 0
    `);

    console.log("PostgreSQL conectado.");
    console.log("Tabelas prontas.");
    console.log("Estrutura de pedidos_processados atualizada.");

  } catch (error) {
    console.error(
      "Erro ao preparar PostgreSQL:",
      error.message
    );
  }
}

/*
|--------------------------------------------------------------------------
| HEADERS NUVEMSHOP
|--------------------------------------------------------------------------
*/

function apiHeaders(accessToken) {
  return {
    Authorization: `Bearer ${accessToken}`,
    "User-Agent": `STAGE 72 (${CLIENT_ID})`,
    "Content-Type": "application/json"
  };
}

/*
|--------------------------------------------------------------------------
| BUSCAR LOJA
|--------------------------------------------------------------------------
*/

async function buscarLoja(storeId) {
  const result = await pool.query(
    `
      SELECT
        store_id,
        access_token
      FROM nuvemshop_stores
      WHERE store_id = $1
      LIMIT 1
    `,
    [storeId]
  );

  return result.rows[0] || null;
}

/*
|--------------------------------------------------------------------------
| GARANTIR LOTE
|--------------------------------------------------------------------------
*/

async function garantirLote(storeId) {
  const existing = await pool.query(
    `
      SELECT *
      FROM lotes

      WHERE
        store_id = $1
        AND product_id = $2
        AND active = TRUE

      ORDER BY id DESC
      LIMIT 1
    `,
    [
      storeId,
      PRODUCT_ID
    ]
  );

  if (existing.rows.length > 0) {
    return existing.rows[0];
  }

  const created = await pool.query(
    `
      INSERT INTO lotes (
        store_id,
        product_id,
        nome,
        current_quantity,
        target_quantity,
        active
      )

      VALUES (
        $1,
        $2,
        'STAGE 72',
        0,
        $3,
        TRUE
      )

      RETURNING *
    `,
    [
      storeId,
      PRODUCT_ID,
      TARGET
    ]
  );

  console.log(
    `Lote criado: produto ${PRODUCT_ID} - 0/${TARGET}`
  );

  return created.rows[0];
}

/*
|--------------------------------------------------------------------------
| LISTAR WEBHOOKS
|--------------------------------------------------------------------------
*/

async function listarWebhooks(
  storeId,
  accessToken
) {
  const response = await fetch(
    `${API_BASE}/${storeId}/webhooks`,
    {
      method: "GET",
      headers: apiHeaders(accessToken)
    }
  );

  const text = await response.text();

  if (!response.ok) {
    throw new Error(
      `Erro listando webhooks: ${response.status} ${text}`
    );
  }

  if (!text) {
    return [];
  }

  return JSON.parse(text);
}

/*
|--------------------------------------------------------------------------
| CRIAR WEBHOOK
|--------------------------------------------------------------------------
*/

async function criarWebhook(
  storeId,
  accessToken,
  event
) {
  const response = await fetch(
    `${API_BASE}/${storeId}/webhooks`,
    {
      method: "POST",

      headers: apiHeaders(accessToken),

      body: JSON.stringify({
        event: event,
        url: WEBHOOK_URL
      })
    }
  );

  const text = await response.text();

  if (!response.ok) {
    throw new Error(
      `Erro criando ${event}: ${response.status} ${text}`
    );
  }

  console.log(
    `Webhook ${event} criado.`
  );

  return true;
}

/*
|--------------------------------------------------------------------------
| CONFIGURAR WEBHOOKS
|--------------------------------------------------------------------------
*/

async function configurarWebhooks(
  storeId,
  accessToken
) {
  const webhooks =
    await listarWebhooks(
      storeId,
      accessToken
    );

  const results = [];

  for (const event of WEBHOOK_EVENTS) {
    const exists =
      Array.isArray(webhooks) &&
      webhooks.some(
        (webhook) =>
          webhook.event === event &&
          webhook.url === WEBHOOK_URL
      );

    if (exists) {
      console.log(
        `Webhook ${event} já existe.`
      );

      results.push({
        event,
        status: "already_exists"
      });

      continue;
    }

    await criarWebhook(
      storeId,
      accessToken,
      event
    );

    results.push({
      event,
      status: "created"
    });
  }

  return results;
}

/*
|--------------------------------------------------------------------------
| BUSCAR PEDIDO
|--------------------------------------------------------------------------
*/

async function buscarPedido(
  storeId,
  accessToken,
  orderId
) {
  const response = await fetch(
    `${API_BASE}/${storeId}/orders/${orderId}`,
    {
      method: "GET",
      headers: apiHeaders(accessToken)
    }
  );

  const text =
    await response.text();

  if (!response.ok) {
    throw new Error(
      `Erro buscando pedido ${orderId}: ${response.status} ${text}`
    );
  }

  return JSON.parse(text);
}

/*
|--------------------------------------------------------------------------
| PROCESSAR PEDIDO
|--------------------------------------------------------------------------
*/

async function processarPedido(
  storeId,
  orderId
) {
  /*
  |--------------------------------------------------------------------------
  | JÁ PROCESSADO?
  |--------------------------------------------------------------------------
  */

  const processed =
    await pool.query(
      `
        SELECT order_id
        FROM pedidos_processados
        WHERE order_id = $1
        LIMIT 1
      `,
      [orderId]
    );

  if (
    processed.rows.length > 0
  ) {
    console.log(
      `Pedido ${orderId} já processado.`
    );

    return;
  }

  /*
  |--------------------------------------------------------------------------
  | TOKEN DA LOJA
  |--------------------------------------------------------------------------
  */

  const store =
    await buscarLoja(storeId);

  if (!store) {
    throw new Error(
      `Loja ${storeId} não autorizada.`
    );
  }

  /*
  |--------------------------------------------------------------------------
  | BUSCAR PEDIDO
  |--------------------------------------------------------------------------
  */

  const order =
    await buscarPedido(
      storeId,
      store.access_token,
      orderId
    );

  console.log(
    `Pedido ${orderId} status de pagamento:`,
    order.payment_status
  );

  /*
  |--------------------------------------------------------------------------
  | SOMENTE PEDIDO PAGO
  |--------------------------------------------------------------------------
  */

  if (
    order.payment_status !== "paid"
  ) {
    console.log(
      `Pedido ${orderId} ainda não está pago.`
    );

    return;
  }

  /*
  |--------------------------------------------------------------------------
  | PRODUTOS
  |--------------------------------------------------------------------------
  */

  const products =
    Array.isArray(order.products)
      ? order.products
      : [];

  /*
  O produto possui variantes:

  38
  40
  42
  44
  46
  48

  Todas usam o mesmo PRODUCT_ID.

  Portanto, ignoramos variant_id
  e somamos todas as unidades desse produto.
  */

  const quantity =
    products
      .filter(
        (item) =>
          Number(item.product_id) ===
          PRODUCT_ID
      )
      .reduce(
        (total, item) =>
          total +
          Number(
            item.quantity || 0
          ),
        0
      );

  /*
  |--------------------------------------------------------------------------
  | PEDIDO NÃO TEM O PRODUTO DO LOTE
  |--------------------------------------------------------------------------
  */

  if (quantity <= 0) {
    console.log(
      `Pedido ${orderId} não contém produto ${PRODUCT_ID}.`
    );

    await pool.query(
      `
        INSERT INTO pedidos_processados (
          order_id,
          store_id,
          product_id,
          quantity
        )

        VALUES (
          $1,
          $2,
          $3,
          0
        )

        ON CONFLICT (order_id)
        DO NOTHING
      `,
      [
        orderId,
        storeId,
        PRODUCT_ID
      ]
    );

    return;
  }

  /*
  |--------------------------------------------------------------------------
  | TRANSAÇÃO
  |--------------------------------------------------------------------------
  */

  const client =
    await pool.connect();

  try {
    await client.query("BEGIN");

    /*
    Garante que um mesmo pedido
    nunca seja contado duas vezes.
    */

    const inserted =
      await client.query(
        `
          INSERT INTO pedidos_processados (
            order_id,
            store_id,
            product_id,
            quantity
          )

          VALUES (
            $1,
            $2,
            $3,
            $4
          )

          ON CONFLICT (order_id)
          DO NOTHING

          RETURNING order_id
        `,
        [
          orderId,
          storeId,
          PRODUCT_ID,
          quantity
        ]
      );

    if (
      inserted.rows.length === 0
    ) {
      await client.query(
        "ROLLBACK"
      );

      console.log(
        `Pedido ${orderId} já contado.`
      );

      return;
    }

    /*
    |--------------------------------------------------------------------------
    | GARANTIR LOTE
    |--------------------------------------------------------------------------
    */

    let loteResult =
      await client.query(
        `
          SELECT id

          FROM lotes

          WHERE
            store_id = $1
            AND product_id = $2
            AND active = TRUE

          ORDER BY id DESC
          LIMIT 1
        `,
        [
          storeId,
          PRODUCT_ID
        ]
      );

    if (
      loteResult.rows.length === 0
    ) {
      loteResult =
        await client.query(
          `
            INSERT INTO lotes (
              store_id,
              product_id,
              nome,
              current_quantity,
              target_quantity,
              active
            )

            VALUES (
              $1,
              $2,
              'STAGE 72',
              0,
              $3,
              TRUE
            )

            RETURNING id
          `,
          [
            storeId,
            PRODUCT_ID,
            TARGET
          ]
        );
    }

    const loteId =
      loteResult.rows[0].id;

    /*
    |--------------------------------------------------------------------------
    | SOMAR AO CONTADOR
    |--------------------------------------------------------------------------
    */

    const updated =
      await client.query(
        `
          UPDATE lotes

          SET
            current_quantity =
              LEAST(
                current_quantity + $1,
                target_quantity
              ),

            updated_at = NOW()

          WHERE id = $2

          RETURNING
            current_quantity,
            target_quantity
        `,
        [
          quantity,
          loteId
        ]
      );

    await client.query(
      "COMMIT"
    );

    const current =
      updated.rows[0]
        .current_quantity;

    const target =
      updated.rows[0]
        .target_quantity;

    console.log(
      `Pedido ${orderId}: +${quantity} peça(s).`
    );

    console.log(
      `Lote STAGE 72: ${current}/${target}`
    );

  } catch (error) {
    try {
      await client.query(
        "ROLLBACK"
      );
    } catch (_) {}

    throw error;

  } finally {
    client.release();
  }
}

/*
|--------------------------------------------------------------------------
| HOME
|--------------------------------------------------------------------------
*/

app.get("/", (req, res) => {
  res.send(`
    <html>
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
| HEALTH
|--------------------------------------------------------------------------
*/

app.get(
  "/health",
  async (req, res) => {
    try {
      await pool.query(
        "SELECT 1"
      );

      res.json({
        ok: true,
        service:
          "stage72-contador",
        database: true
      });

    } catch (error) {
      res.status(500).json({
        ok: false,
        database: false
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| OAUTH
|--------------------------------------------------------------------------
*/

app.get(
  "/auth/callback",
  async (req, res) => {
    const code =
      req.query.code;

    if (!code) {
      return res
        .status(400)
        .send(
          "Código de autorização não recebido."
        );
    }

    if (
      !CLIENT_ID ||
      !CLIENT_SECRET
    ) {
      return res
        .status(500)
        .send(
          "Credenciais não configuradas."
        );
    }

    try {
      const response =
        await fetch(
          "https://www.tiendanube.com/apps/authorize/token",
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json"
            },

            body:
              JSON.stringify({
                client_id:
                  CLIENT_ID,

                client_secret:
                  CLIENT_SECRET,

                grant_type:
                  "authorization_code",

                code
              })
          }
        );

      const data =
        await response.json();

      if (
        !response.ok ||
        data.error
      ) {
        console.error(
          "Erro OAuth:",
          data.error
        );

        console.error(
          "Descrição OAuth:",
          data.error_description
        );

        return res
          .status(500)
          .send(
            "Falha na autorização."
          );
      }

      const storeId =
        Number(
          data.user_id
        );

      if (
        !storeId ||
        !data.access_token
      ) {
        return res
          .status(500)
          .send(
            "Dados OAuth incompletos."
          );
      }

      /*
      Salvar autorização.
      */

      await pool.query(
        `
          INSERT INTO nuvemshop_stores (
            store_id,
            access_token,
            updated_at
          )

          VALUES (
            $1,
            $2,
            NOW()
          )

          ON CONFLICT (store_id)

          DO UPDATE SET
            access_token =
              EXCLUDED.access_token,

            updated_at =
              NOW()
        `,
        [
          storeId,
          data.access_token
        ]
      );

      await garantirLote(
        storeId
      );

      const webhooks =
        await configurarWebhooks(
          storeId,
          data.access_token
        );

      console.log(
        "Nuvemshop conectada."
      );

      console.log(
        "Store ID:",
        storeId
      );

      console.log(
        "Webhooks:",
        webhooks
      );

      return res.send(`
        <html>
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

              <h2>
                LOJA CONECTADA
              </h2>

              <p>
                Integração autorizada.
              </p>

              <p>
                Webhooks configurados.
              </p>

            </div>

          </body>
        </html>
      `);

    } catch (error) {
      console.error(
        "Erro OAuth:",
        error.message
      );

      return res
        .status(500)
        .send(
          "Erro interno."
        );
    }
  }
);

/*
|--------------------------------------------------------------------------
| WEBHOOK
|--------------------------------------------------------------------------
*/

app.post(
  "/webhooks/orders",
  (req, res) => {
    /*
    Responde imediatamente à Nuvemshop.
    */

    res.sendStatus(200);

    const payload =
      req.body || {};

    const storeId =
      Number(
        payload.store_id
      );

    const orderId =
      Number(
        payload.id
      );

    const event =
      payload.event;

    console.log(
      "Webhook recebido:",
      {
        storeId,
        orderId,
        event
      }
    );

    if (
      !storeId ||
      !orderId
    ) {
      console.error(
        "Webhook sem store_id ou id."
      );

      return;
    }

    if (
      !WEBHOOK_EVENTS.includes(
        event
      )
    ) {
      return;
    }

    processarPedido(
      storeId,
      orderId
    ).catch(
      (error) => {
        console.error(
          "Erro processamento webhook:",
          error.message
        );
      }
    );
  }
);

/*
|--------------------------------------------------------------------------
| REPROCESSAR PEDIDO DE TESTE
|--------------------------------------------------------------------------
|
| Criamos esta rota para reaproveitar
| a venda que você já fez.
|
|--------------------------------------------------------------------------
*/

app.get(
  "/api/reprocess-order/:orderId",
  async (req, res) => {
    try {
      const orderId =
        Number(
          req.params.orderId
        );

      if (!orderId) {
        return res
          .status(400)
          .json({
            ok: false,
            error:
              "orderId inválido."
          });
      }

      const storeResult =
        await pool.query(`
          SELECT
            store_id

          FROM nuvemshop_stores

          ORDER BY
            updated_at DESC

          LIMIT 1
        `);

      if (
        storeResult.rows.length === 0
      ) {
        return res
          .status(404)
          .json({
            ok: false,
            error:
              "Nenhuma loja autorizada."
          });
      }

      const storeId =
        Number(
          storeResult.rows[0]
            .store_id
        );

      await processarPedido(
        storeId,
        orderId
      );

      return res.json({
        ok: true,
        storeId,
        orderId,
        message:
          "Pedido processado."
      });

    } catch (error) {
      console.error(
        "Erro reprocessamento:",
        error.message
      );

      return res
        .status(500)
        .json({
          ok: false,
          error:
            error.message
        });
    }
  }
);

/*
|--------------------------------------------------------------------------
| SETUP WEBHOOKS
|--------------------------------------------------------------------------
*/

app.get(
  "/api/setup-webhooks",
  async (req, res) => {
    try {
      const stores =
        await pool.query(`
          SELECT
            store_id,
            access_token

          FROM nuvemshop_stores

          ORDER BY
            updated_at DESC
        `);

      if (
        stores.rows.length === 0
      ) {
        return res
          .status(404)
          .json({
            ok: false,
            error:
              "Nenhuma loja autorizada."
          });
      }

      const results = [];

      for (
        const store
        of stores.rows
      ) {
        const storeId =
          Number(
            store.store_id
          );

        const result =
          await configurarWebhooks(
            storeId,
            store.access_token
          );

        await garantirLote(
          storeId
        );

        results.push({
          storeId,
          webhooks: result
        });
      }

      return res.json({
        ok: true,
        webhookUrl:
          WEBHOOK_URL,
        results
      });

    } catch (error) {
      console.error(
        "Erro setup-webhooks:",
        error.message
      );

      return res
        .status(500)
        .json({
          ok: false,
          error:
            error.message
        });
    }
  }
);

/*
|--------------------------------------------------------------------------
| API LOTE
|--------------------------------------------------------------------------
*/

app.get(
  "/api/lote",
  async (req, res) => {
    try {
      const result =
        await pool.query(
          `
            SELECT
              id,
              store_id,
              product_id,
              nome,
              current_quantity,
              target_quantity

            FROM lotes

            WHERE
              product_id = $1
              AND active = TRUE

            ORDER BY
              updated_at DESC

            LIMIT 1
          `,
          [PRODUCT_ID]
        );

      if (
        result.rows.length === 0
      ) {
        return res
          .status(404)
          .json({
            ok: false,
            error:
              "Lote não configurado."
          });
      }

      const lote =
        result.rows[0];

      const current =
        Number(
          lote.current_quantity
        );

      const target =
        Number(
          lote.target_quantity
        );

      const remaining =
        Math.max(
          target - current,
          0
        );

      const percentage =
        target > 0
          ? Math.min(
              Math.round(
                (
                  current /
                  target
                ) * 100
              ),
              100
            )
          : 0;

      return res.json({
        ok: true,

        id:
          lote.id,

        storeId:
          lote.store_id,

        productId:
          lote.product_id,

        name:
          lote.nome,

        current,
        target,
        remaining,
        percentage,

        closed:
          current >= target
      });

    } catch (error) {
      console.error(
        "Erro lote:",
        error.message
      );

      return res
        .status(500)
        .json({
          ok: false,
          error:
            error.message
        });
    }
  }
);

/*
|--------------------------------------------------------------------------
| STATUS
|--------------------------------------------------------------------------
*/

app.get(
  "/api/status",
  async (req, res) => {
    try {
      const result =
        await pool.query(`
          SELECT
            store_id,
            updated_at

          FROM nuvemshop_stores

          ORDER BY
            updated_at DESC

          LIMIT 1
        `);

      return res.json({
        ok: true,

        nuvemshopConnected:
          result.rows.length > 0,

        storeId:
          result.rows[0]
            ?.store_id ??
          null,

        productId:
          PRODUCT_ID,

        target:
          TARGET
      });

    } catch (error) {
      return res
        .status(500)
        .json({
          ok: false
        });
    }
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
    res.sendStatus(200);
  }
);

app.post(
  "/webhooks/lgpd/customers-redact",
  (req, res) => {
    res.sendStatus(200);
  }
);

app.post(
  "/webhooks/lgpd/customers-data-request",
  (req, res) => {
    res.sendStatus(200);
  }
);

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
