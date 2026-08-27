const express = require("express");
const { Pool } = require("pg");

const app = express();
const PORT = process.env.PORT || 3000;

/*
|--------------------------------------------------------------------------
| CORS
|--------------------------------------------------------------------------
*/

app.use((req, res, next) => {
  res.setHeader(
    "Access-Control-Allow-Origin",
    "*"
  );

  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, OPTIONS"
  );

  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Accept, Authorization"
  );

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});

app.use(express.json());

/*
|--------------------------------------------------------------------------
| VARIÁVEIS
|--------------------------------------------------------------------------
*/

const CLIENT_ID =
  process.env.NUVEMSHOP_CLIENT_ID;

const CLIENT_SECRET =
  process.env.NUVEMSHOP_CLIENT_SECRET;

const DATABASE_URL =
  process.env.DATABASE_URL;

/*
|--------------------------------------------------------------------------
| STAGE 72
|--------------------------------------------------------------------------
|
| Não existe mais PRODUCT_ID fixo.
| Cada produto terá seu próprio lote.
|--------------------------------------------------------------------------
*/

const DEFAULT_TARGET = 10;

const API_BASE =
  "https://api.nuvemshop.com.br/v1";

const BASE_URL =
  "https://stage72-contador.onrender.com";

const ORDER_WEBHOOK_URL =
  `${BASE_URL}/webhooks/orders`;

const PRODUCT_WEBHOOK_URL =
  `${BASE_URL}/webhooks/products`;

/*
|--------------------------------------------------------------------------
| WEBHOOKS
|--------------------------------------------------------------------------
*/

const WEBHOOK_CONFIGS = [
  {
    event: "order/created",
    url: ORDER_WEBHOOK_URL
  },
  {
    event: "order/updated",
    url: ORDER_WEBHOOK_URL
  },
  {
    event: "product/created",
    url: PRODUCT_WEBHOOK_URL
  },
  {
    event: "product/updated",
    url: PRODUCT_WEBHOOK_URL
  }
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
      : {
          rejectUnauthorized: false
        }
});

/*
|--------------------------------------------------------------------------
| NORMALIZAR NOME
|--------------------------------------------------------------------------
|
| A API pode devolver:
|
| "Calça"
|
| ou:
|
| {
|   pt: "Calça"
| }
|--------------------------------------------------------------------------
*/

function normalizarNomeProduto(nome) {

  if (!nome) {
    return "Produto STAGE 72";
  }

  if (typeof nome === "string") {
    return nome;
  }

  if (typeof nome === "object") {

    return (
      nome.pt ||
      nome["pt-BR"] ||
      nome.es ||
      nome.en ||
      Object.values(nome)[0] ||
      "Produto STAGE 72"
    );
  }

  return String(nome);
}

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
    Compatibilidade com versões antigas.
    */

    await pool.query(`
      ALTER TABLE lotes
      ADD COLUMN IF NOT EXISTS store_id BIGINT
    `);

    await pool.query(`
      ALTER TABLE lotes
      ADD COLUMN IF NOT EXISTS product_id BIGINT
    `);

    await pool.query(`
      ALTER TABLE lotes
      ADD COLUMN IF NOT EXISTS nome TEXT
    `);

    await pool.query(`
      ALTER TABLE lotes
      ADD COLUMN IF NOT EXISTS current_quantity
      INTEGER NOT NULL DEFAULT 0
    `);

    await pool.query(`
      ALTER TABLE lotes
      ADD COLUMN IF NOT EXISTS target_quantity
      INTEGER NOT NULL DEFAULT 10
    `);

    await pool.query(`
  ALTER TABLE lotes
  ADD COLUMN IF NOT EXISTS active
  BOOLEAN NOT NULL DEFAULT TRUE
`);

await pool.query(`
  ALTER TABLE lotes
  ADD COLUMN IF NOT EXISTS reopened
  BOOLEAN NOT NULL DEFAULT FALSE
`);

await pool.query(`
  ALTER TABLE lotes
  ADD COLUMN IF NOT EXISTS reopened_at
  TIMESTAMPTZ
`);

await pool.query(`
  ALTER TABLE lotes
  ADD COLUMN IF NOT EXISTS closed_at
  TIMESTAMPTZ
`);

    await pool.query(`
  ALTER TABLE lotes
  ADD COLUMN IF NOT EXISTS final_closed
  BOOLEAN NOT NULL DEFAULT FALSE
`);
    
/*

    |--------------------------------------------------------------------------
    | PEDIDOS PROCESSADOS
    |--------------------------------------------------------------------------
    |
    | Aqui continuamos registrando o pedido uma única vez.
    |
    | Dentro de um pedido podemos atualizar vários produtos.
    |--------------------------------------------------------------------------
    */

    await pool.query(`
      CREATE TABLE IF NOT EXISTS pedidos_processados (
        order_id BIGINT PRIMARY KEY,
        store_id BIGINT,
        quantity INTEGER NOT NULL DEFAULT 0,
        processed_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await pool.query(`
      ALTER TABLE pedidos_processados
      ADD COLUMN IF NOT EXISTS store_id BIGINT
    `);

    await pool.query(`
  ALTER TABLE pedidos_processados
  ADD COLUMN IF NOT EXISTS quantity
  INTEGER NOT NULL DEFAULT 0
`);

await pool.query(`
  CREATE TABLE IF NOT EXISTS pedido_itens_processados (
    id SERIAL PRIMARY KEY,
    order_id BIGINT NOT NULL,
    store_id BIGINT NOT NULL,
    product_id BIGINT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 0,
    reversed_quantity INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (order_id, product_id)
  )
`);

/*
A coluna product_id antiga pode continuar existindo.
Não precisamos apagá-la para não correr risco
com dados históricos.
*/

    /*
    A coluna product_id antiga pode continuar existindo.
    Não precisamos apagá-la para não correr risco
    com dados históricos.
    */

    console.log("PostgreSQL conectado.");
    console.log("Tabelas prontas.");
    console.log(
      "STAGE 72 preparado para múltiplos produtos."
    );

  } catch (error) {

    console.error(
      "Erro ao preparar PostgreSQL:",
      error.message
    );

    throw error;
  }
}

/*
|--------------------------------------------------------------------------
| HEADERS NUVEMSHOP
|--------------------------------------------------------------------------
*/

function apiHeaders(accessToken) {

  return {
    Authorization:
      `Bearer ${accessToken}`,

    "User-Agent":
      `STAGE 72 (${CLIENT_ID})`,

    "Content-Type":
      "application/json",

    Accept:
      "application/json"
  };
}

/*
|--------------------------------------------------------------------------
| BUSCAR LOJA
|--------------------------------------------------------------------------
*/

async function buscarLoja(storeId) {

  const result =
    await pool.query(
      `
        SELECT
          store_id,
          access_token

        FROM nuvemshop_stores

        WHERE store_id = $1

        LIMIT 1
      `,
      [
        storeId
      ]
    );

  return result.rows[0] || null;
}

/*
|--------------------------------------------------------------------------
| BUSCAR ÚLTIMA LOJA
|--------------------------------------------------------------------------
*/

async function buscarUltimaLoja() {

  const result =
    await pool.query(`
      SELECT
        store_id,
        access_token

      FROM nuvemshop_stores

      ORDER BY
        updated_at DESC

      LIMIT 1
    `);

  return result.rows[0] || null;
}

/*
|--------------------------------------------------------------------------
| GARANTIR LOTE DO PRODUTO
|--------------------------------------------------------------------------
*/

async function garantirLote(
  storeId,
  productId,
  productName = "Produto STAGE 72"
) {

  productId =
    Number(productId);

  if (!productId) {

    throw new Error(
      "productId inválido ao criar lote."
    );
  }

  const nome =
    normalizarNomeProduto(
      productName
    );

  /*
  Procura lote ativo existente.
  */

  const existing =
    await pool.query(
      `
        SELECT *

        FROM lotes

        WHERE
          store_id = $1
          AND product_id = $2
          AND active = TRUE

        ORDER BY
          id DESC

        LIMIT 1
      `,
      [
        storeId,
        productId
      ]
    );

  if (
    existing.rows.length > 0
  ) {

    /*
    Atualiza o nome caso tenha mudado.
    */

    await pool.query(
      `
        UPDATE lotes

        SET
          nome = $1,
          updated_at = NOW()

        WHERE id = $2
      `,
      [
        nome,
        existing.rows[0].id
      ]
    );

    return {
      ...existing.rows[0],
      nome
    };
  }

  /*
  Cria lote automaticamente.
  */

  const created =
    await pool.query(      `
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
          $3,
          0,
          $4,
          TRUE
        )

        RETURNING *
      `,
      [
        storeId,
        productId,
        nome,
        DEFAULT_TARGET
      ]
    );

  console.log(
    `Lote criado automaticamente: ${nome} (${productId}) 0/${DEFAULT_TARGET}`
  );

  return created.rows[0];
}

/*
|--------------------------------------------------------------------------
| BUSCAR PRODUTO NA NUVEMSHOP
|--------------------------------------------------------------------------
*/

async function buscarProduto(
  storeId,
  accessToken,
  productId
) {

  const response =
    await fetch(
      `${API_BASE}/${storeId}/products/${productId}`,
      {
        method: "GET",

        headers:
          apiHeaders(accessToken)
      }
    );

  const text =
    await response.text();

  if (!response.ok) {

    throw new Error(
      `Erro buscando produto ${productId}: ${response.status} ${text}`
    );
  }

  return text
    ? JSON.parse(text)
    : null;
}

/*
|--------------------------------------------------------------------------
| LISTAR PRODUTOS DA NUVEMSHOP
|--------------------------------------------------------------------------
*/

async function listarProdutos(
  storeId,
  accessToken
) {

  const todos = [];

  let page = 1;

  while (true) {

    const response =
      await fetch(
        `${API_BASE}/${storeId}/products?per_page=200&page=${page}`,
        {
          method: "GET",

          headers:
            apiHeaders(accessToken)
        }
      );

    const text =
      await response.text();

    if (!response.ok) {

      throw new Error(
        `Erro listando produtos: ${response.status} ${text}`
      );
    }

    const products =
      text
        ? JSON.parse(text)
        : [];

    if (
      !Array.isArray(products) ||
      products.length === 0
    ) {
      break;
    }

    todos.push(
      ...products
    );

    if (
      products.length < 200
    ) {
      break;
    }

    page += 1;
  }

  return todos;
}

/*
|--------------------------------------------------------------------------
| SINCRONIZAR PRODUTOS
|--------------------------------------------------------------------------
|
| Cria lote 0/10 para qualquer produto publicado
| que ainda não exista no banco.
|--------------------------------------------------------------------------
*/

async function sincronizarProdutos(
  storeId,
  accessToken
) {

  const products =
    await listarProdutos(
      storeId,
      accessToken
    );

  const results = [];

  for (
    const product
    of products
  ) {

    const productId =
      Number(
        product.id
      );

    if (!productId) {
      continue;
    }

    /*
    Ignora produto não publicado.
    */

    if (
      product.published === false
    ) {
      continue;
    }

    const nome =
      normalizarNomeProduto(
        product.name
      );

    const lote =
      await garantirLote(
        storeId,
        productId,
        nome
      );

    results.push({
      productId,
      nome,
      loteId:
        lote.id,

      current:
        Number(
          lote.current_quantity || 0
        ),

      target:
        Number(
          lote.target_quantity ||
          DEFAULT_TARGET
        )
    });
  }

  console.log(
    `Sincronização concluída: ${results.length} produto(s).`
  );

  return results;
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

  const response =
    await fetch(
      `${API_BASE}/${storeId}/webhooks`,
      {
        method: "GET",

        headers:
          apiHeaders(accessToken)
      }
    );

  const text =
    await response.text();

  if (!response.ok) {

    throw new Error(
      `Erro listando webhooks: ${response.status} ${text}`
    );
  }

  return text
    ? JSON.parse(text)
    : [];
}

/*
|--------------------------------------------------------------------------
| CRIAR WEBHOOK
|--------------------------------------------------------------------------
*/

async function criarWebhook(
  storeId,
  accessToken,
  event,
  url
) {

  const response =
    await fetch(
      `${API_BASE}/${storeId}/webhooks`,
      {
        method: "POST",

        headers:
          apiHeaders(accessToken),

        body:
          JSON.stringify({
            event,
            url
          })
      }
    );

  const text =
    await response.text();

  if (!response.ok) {

    throw new Error(
      `Erro criando webhook ${event}: ${response.status} ${text}`
    );
  }

  console.log(
    `Webhook ${event} criado em ${url}`
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

  const existentes =
    await listarWebhooks(
      storeId,
      accessToken
    );

  const results = [];

  for (
    const config
    of WEBHOOK_CONFIGS
  ) {

    const exists =
      Array.isArray(existentes) &&
      existentes.some(
        (webhook) =>
          webhook.event === config.event &&
          webhook.url === config.url
      );

    if (exists) {

      results.push({
        event:
          config.event,

        url:
          config.url,

        status:
          "already_exists"
      });

      continue;
    }

    await criarWebhook(
      storeId,
      accessToken,
      config.event,
      config.url
    );

    results.push({
      event:
        config.event,

      url:
        config.url,

      status:
        "created"
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

  const response =
    await fetch(
      `${API_BASE}/${storeId}/orders/${orderId}`,
      {
        method: "GET",

        headers:
          apiHeaders(accessToken)
      }
    );

  const text =
    await response.text();

  if (!response.ok) {

    throw new Error(
      `Erro buscando pedido ${orderId}: ${response.status} ${text}`
    );
  }

  return text
    ? JSON.parse(text)
    : null;
}

/*
|--------------------------------------------------------------------------
| AGRUPAR ITENS DO PEDIDO POR PRODUTO
|--------------------------------------------------------------------------
|
| Exemplo:
|
| Tamanho 38 + tamanho 40 do mesmo produto
| viram uma única contagem:
|
| product_id 123 = 2 peças
|--------------------------------------------------------------------------
*/

function agruparProdutosPedido(
  products
) {

  const grouped =
    new Map();

  for (
    const item
    of products
  ) {

    const productId =
      Number(
        item.product_id
      );

    const quantity =
      Number(
        item.quantity || 0
      );

    if (
      !productId ||
      quantity <= 0
    ) {
      continue;
    }

    const atual =
      grouped.get(productId) || {
        productId,
        quantity: 0,
        nome:
          normalizarNomeProduto(
            item.name
          )
      };

    atual.quantity +=
      quantity;

    if (
      !atual.nome ||
      atual.nome === "Produto STAGE 72"
    ) {
      atual.nome =
        normalizarNomeProduto(
          item.name
        );
    }

    grouped.set(
      productId,
      atual
    );
  }

  return Array.from(
    grouped.values()
  );
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
  | VERIFICAR SE O PEDIDO JÁ FOI PROCESSADO
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
      [
        orderId
      ]
    );

  const jaProcessado =
    processed.rows.length > 0;

  const store =
    await buscarLoja(
      storeId
    );

  if (!store) {

    throw new Error(
      `Loja ${storeId} não autorizada.`
    );
  }

  /*
  |--------------------------------------------------------------------------
  | BUSCAR ESTADO ATUAL DO PEDIDO NA NUVEMSHOP
  |--------------------------------------------------------------------------
  */

  const order =
    await buscarPedido(
      storeId,
      store.access_token,
      orderId
    );

  if (!order) {

    throw new Error(
      `Pedido ${orderId} não encontrado.`
    );
  }

  console.log(
    `Pedido ${orderId} status de pagamento:`,
    order.payment_status
  );

  /*
  |--------------------------------------------------------------------------
  | DEBUG CANCELAMENTO
  |--------------------------------------------------------------------------
  */

  console.log(
    `STAGE 72 DEBUG PEDIDO ${orderId}:`,
    {
      jaProcessado:
        jaProcessado,

      payment_status:
        order.payment_status,

      status:
        order.status,

      shipping_status:
        order.shipping_status,

      cancelled_at:
        order.cancelled_at,

      canceled_at:
        order.canceled_at,

      closed_at:
        order.closed_at
    }
  );

  /*
  |--------------------------------------------------------------------------
  | PEDIDO NOVO AINDA NÃO PAGO
  |--------------------------------------------------------------------------
  */

  if (
    !jaProcessado &&
    order.payment_status !== "paid"
  ) {

    return {
      processed: false,
      reason:
        "not_paid"
    };
  }

  /*
  |--------------------------------------------------------------------------
  | PEDIDO JÁ PROCESSADO
  |
  | Por enquanto apenas deixamos o status aparecer nos logs.
  | No próximo passo entra a reversão do cancelamento.
  |--------------------------------------------------------------------------
  */

  if (jaProcessado) {

  /*
  |--------------------------------------------------------------------------
  | PEDIDO CANCELADO
  |--------------------------------------------------------------------------
  */

  if (order.status === "cancelled") {

    const client =
      await pool.connect();

    try {

      await client.query("BEGIN");

      const itens =
        await client.query(
          `
            SELECT
              product_id,
              quantity,
              reversed_quantity

            FROM pedido_itens_processados

            WHERE order_id = $1
          `,
          [
            orderId
          ]
        );

      for (const item of itens.rows) {

        const quantity =
          Number(item.quantity || 0);

        const reversed =
          Number(
            item.reversed_quantity || 0
          );

        const devolver =
          Math.max(
            quantity - reversed,
            0
          );

        if (devolver <= 0) {
          continue;
        }

        await client.query(
  `
    UPDATE lotes

    SET
      current_quantity =
        GREATEST(
          current_quantity - $1,
          0
        ),

      reopened =
        CASE
          WHEN
            current_quantity >= target_quantity
            AND GREATEST(current_quantity - $1, 0) < target_quantity
            AND reopened = FALSE
          THEN TRUE
          ELSE reopened
        END,

      reopened_at =
        CASE
          WHEN
            current_quantity >= target_quantity
            AND GREATEST(current_quantity - $1, 0) < target_quantity
            AND reopened = FALSE
          THEN NOW()
          ELSE reopened_at
        END,

      updated_at =
        NOW()

    WHERE
      store_id = $2
      AND product_id = $3
  `,
  [
    devolver,
    storeId,
    Number(item.product_id)
  ]
);

        await client.query(
          `
            UPDATE pedido_itens_processados

            SET
              reversed_quantity =
                quantity,

              updated_at =
                NOW()

            WHERE
              order_id = $1
              AND product_id = $2
          `,
          [
            orderId,
            Number(item.product_id)
          ]
        );
      }

      await client.query("COMMIT");

      console.log(
        `Pedido ${orderId} cancelado e revertido.`
      );

      return {
        processed: true,
        reason:
          "cancelled_reversed"
      };

    } catch (error) {

      await client.query("ROLLBACK");

      throw error;

    } finally {

      client.release();
    }
  }

  /*
  Pedido já processado, mas não está cancelado.
  Não soma novamente.
  */

  console.log(
    `Pedido ${orderId} já processado.`
  );

  return {
    processed: false,
    reason:
      "already_processed"
  };
}
  if (
    order.payment_status !== "paid"
  ) {

    return {
      processed: false,
      reason:
        "not_paid"
    };
  }

  const products =
    Array.isArray(
      order.products
    )
      ? order.products
      : [];

  const grouped =
    agruparProdutosPedido(
      products
    );

  if (
    grouped.length === 0
  ) {

    return {
      processed: false,
      reason:
        "no_products"
    };
  }

  const client =
    await pool.connect();

  try {

    await client.query(
      "BEGIN"
    );

    /*
    Registra o pedido uma única vez.
    */

    const inserted =
      await client.query(
        `
          INSERT INTO pedidos_processados (
            order_id,
            store_id,
            quantity
          )

          VALUES (
            $1,
            $2,
            $3
          )

          ON CONFLICT (order_id)
          DO NOTHING

          RETURNING order_id
        `,
        [
          orderId,
          storeId,
          grouped.reduce(
            (total, item) =>
              total + item.quantity,
            0
          )
        ]
      );

    if (
      inserted.rows.length === 0
    ) {

      await client.query(
        "ROLLBACK"
      );

      return {
        processed: false,
        reason:
          "already_processed"
      };
    }

    const updates = [];

    for (
      const item
      of grouped
    ) {

      const productId =
        item.productId;

      let nome =
        item.nome;

      /*
      Tenta obter o nome oficial
      direto da Nuvemshop.
      */

      try {

        const product =
          await buscarProduto(
            storeId,
            store.access_token,
            productId
          );

        if (
          product &&
          product.name
        ) {

          nome =
            normalizarNomeProduto(
              product.name
            );
        }

      } catch (error) {

        console.error(
          `Não foi possível atualizar nome do produto ${productId}:`,
          error.message
        );
      }

      /*
      Garante lote do produto.
      */

      const loteResult =
        await client.query(
          `
            SELECT *

            FROM lotes

            WHERE
              store_id = $1
              AND product_id = $2
              AND active = TRUE

            ORDER BY
              id DESC

            LIMIT 1
          `,
          [
            storeId,
            productId
          ]
        );

      let lote;

      if (
        loteResult.rows.length > 0
      ) {

        lote =
          loteResult.rows[0];

        await client.query(
          `
            UPDATE lotes

            SET
              nome = $1,
              updated_at = NOW()

            WHERE id = $2
          `,
          [
            nome,
            lote.id
          ]
        );

      } else {

        const created =
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
                $3,
                0,
                $4,
                TRUE
              )

              RETURNING *
            `,
            [
              storeId,
              productId,
              nome,
              DEFAULT_TARGET
            ]
          );

        lote =
          created.rows[0];
      }

      /*
      Atualiza apenas o lote
      desse produto.
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

        closed_at =
          CASE
            WHEN
              current_quantity + $1 >= target_quantity
              AND closed_at IS NULL
            THEN NOW()
            ELSE closed_at
          END,

        updated_at =
          NOW()

      WHERE id = $2

      RETURNING
        id,
        product_id,
        nome,
        current_quantity,
        target_quantity,
        closed_at,
        reopened,
        reopened_at
    `,
    [
      item.quantity,
      lote.id
    ]
  );

await client.query(
  `
    INSERT INTO pedido_itens_processados (
      order_id,
      store_id,
      product_id,
      quantity,
      reversed_quantity,
      updated_at
    )

    VALUES (
      $1,
      $2,
      $3,
      $4,
      0,
      NOW()
    )

    ON CONFLICT (order_id, product_id)

    DO UPDATE SET
      quantity = EXCLUDED.quantity,
      updated_at = NOW()
  `,
  [
    orderId,
    storeId,
    productId,
    item.quantity
  ]
);
        updates.push({
    productId,

        quantity:
          item.quantity,

        nome:
          updated.rows[0].nome,

        current:
          Number(
            updated.rows[0]
              .current_quantity
          ),

        target:
          Number(
            updated.rows[0]
              .target_quantity
          )
      });
    }

    await client.query(
      "COMMIT"
    );

    console.log(
      `Pedido ${orderId} processado em ${updates.length} produto(s).`
    );

    return {
      processed: true,
      products:
        updates
    };

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

app.get(
  "/",
  (req, res) => {

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
            <p>Backend multi-produto online.</p>
          </div>
        </body>
      </html>
    `);
  }
);

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

      return res.json({
        ok: true,
        service:
          "stage72-contador",
        database: true,
        multiProduct: true
      });

    } catch (error) {

      return res
        .status(500)
        .json({
          ok: false,
          error:
            error.message
        });
    }
  }
);/*
|--------------------------------------------------------------------------
| TESTE CORS
|--------------------------------------------------------------------------
*/

app.get(
  "/api/cors-test",
  (req, res) => {

    res.setHeader(
      "Cache-Control",
      "no-store"
    );

    return res.json({
      ok: true,
      cors: true,
      multiProduct: true,
      message:
        "STAGE 72 multi-produto ativo"
    });
  }
);

/*
|--------------------------------------------------------------------------
| OAUTH NUVEMSHOP
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
          "Credenciais da integração não configuradas."
        );
    }

    try {

      console.log(
        "Código OAuth recebido."
      );

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

                code:
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
          data
        );

        return res
          .status(500)
          .send(
            "Não foi possível concluir a autorização."
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
      Salva ou atualiza o token da loja.
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

      /*
      Configura webhooks.
      */

      const webhooks =
        await configurarWebhooks(
          storeId,
          data.access_token
        );

      /*
      Já sincroniza todos os produtos
      existentes nessa autorização.
      */

      const produtos =
        await sincronizarProdutos(
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
        `Produtos sincronizados: ${produtos.length}`
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

            <div style="
              text-align:center;
            ">

              <h1>
                STAGE 72
              </h1>

              <h2>
                LOJA CONECTADA
              </h2>

              <p>
                Integração multi-produto ativa.
              </p>

              <p>
                Store ID:
                ${storeId}
              </p>

              <p>
                Produtos sincronizados:
                ${produtos.length}
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
          `Erro interno: ${error.message}`
        );
    }
  }
);

/*
|--------------------------------------------------------------------------
| WEBHOOK DE PRODUTOS
|--------------------------------------------------------------------------
|
| Quando um produto for criado ou atualizado,
| garantimos automaticamente o lote dele.
|--------------------------------------------------------------------------
*/

app.post(
  "/webhooks/products",
  (req, res) => {

    /*
    Responde rápido para a Nuvemshop.
    */

    res.sendStatus(200);

    const payload =
      req.body || {};

    const storeId =
      Number(
        payload.store_id
      );

    const productId =
      Number(
        payload.id
      );

    const event =
      payload.event;

    console.log(
      "Webhook produto recebido:",
      {
        storeId,
        productId,
        event
      }
    );

    if (
      !storeId ||
      !productId
    ) {

      console.error(
        "Webhook de produto incompleto."
      );

      return;
    }

    /*
    Processa fora da resposta do webhook.
    */

    (async () => {

      try {

        const store =
          await buscarLoja(
            storeId
          );

        if (!store) {

          throw new Error(
            `Loja ${storeId} não autorizada.`
          );
        }

        const product =
          await buscarProduto(
            storeId,
            store.access_token,
            productId
          );

        if (!product) {
          return;
        }

        /*
        Se estiver publicado, cria/atualiza lote.
        */

        if (
          product.published !== false
        ) {

          const nome =
            normalizarNomeProduto(
              product.name
            );

          const lote =
            await garantirLote(
              storeId,
              productId,
              nome
            );

          console.log(
            `Produto sincronizado: ${nome} (${productId})`
          );

          console.log(
            `Contador: ${lote.current_quantity}/${lote.target_quantity}`
          );

        } else {

          /*
          Produto despublicado não é apagado.
          Apenas preservamos os dados históricos.
          */

          console.log(
            `Produto ${productId} não está publicado.`
          );
        }

      } catch (error) {

        console.error(
          "Erro webhook produto:",
          error.message
        );
      }

    })();
  }
);

/*
|--------------------------------------------------------------------------
| WEBHOOK DE PEDIDOS
|--------------------------------------------------------------------------
*/

app.post(
  "/webhooks/orders",
  (req, res) => {

    /*
    Responde imediatamente.
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
      "Webhook pedido recebido:",
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
      event !== "order/created" &&
      event !== "order/updated"
    ) {
      return;
    }

    processarPedido(
      storeId,
      orderId
    ).catch(
      (error) => {

        console.error(
          "Erro processamento pedido:",
          error.message
        );
      }
    );
  }
);

/*
|--------------------------------------------------------------------------
| SINCRONIZAR PRODUTOS MANUALMENTE
|--------------------------------------------------------------------------
|
| Essa rota também é nosso botão de emergência.
|
| Abrir:
|
| /api/sync-products
|
| e todos os produtos publicados serão sincronizados.
|--------------------------------------------------------------------------
*/

app.get(
  "/api/sync-products",
  async (req, res) => {

    try {

      const store =
        await buscarUltimaLoja();

      if (!store) {

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
          store.store_id
        );

      const products =
        await sincronizarProdutos(
          storeId,
          store.access_token
        );

      return res.json({
        ok: true,

        storeId,

        total:
          products.length,

        targetDefault:
          DEFAULT_TARGET,

        products
      });

    } catch (error) {

      console.error(
        "Erro sincronizando produtos:",
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
| LISTAR PRODUTOS / CONTADORES
|--------------------------------------------------------------------------
*/

app.get(
  "/api/products",
  async (req, res) => {

    try {

      const store =
        await buscarUltimaLoja();

      if (!store) {

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
          store.store_id
        );

      const result =
        await pool.query(
          `
            SELECT
              id,
              store_id,
              product_id,
              nome,
              current_quantity,
              target_quantity,
              active,
              updated_at

            FROM lotes

            WHERE
              store_id = $1
              AND active = TRUE

            ORDER BY
              created_at ASC,
              id ASC
          `,
          [
            storeId
          ]
        );

      return res.json({
        ok: true,

        storeId,

        total:
          result.rows.length,

        products:
          result.rows.map(
            (lote) => {

              const current =
                Number(
                  lote.current_quantity
                );

              const target =
                Number(
                  lote.target_quantity
                );

              return {
                id:
                  lote.id,

                productId:
                  Number(
                    lote.product_id
                  ),

                name:
                  lote.nome,

                current,

                target,

                remaining:
                  Math.max(
                    target - current,
                    0
                  ),

                percentage:
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
                    : 0,

                closed:
  current >= target,

endAt:
  lote.end_at
              };
            }
          )
      });

    } catch (error) {

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
| API LOTE POR PRODUTO
|--------------------------------------------------------------------------
|
| Agora o frontend poderá pedir:
|
| /api/lote/362509901
|
| e futuramente:
|
| /api/lote/OUTRO_PRODUCT_ID
|--------------------------------------------------------------------------
*/

app.get(
  "/api/lote/:productId",
  async (req, res) => {

    try {

      const productId =
        Number(
          req.params.productId
        );

      if (!productId) {

        return res
          .status(400)
          .json({
            ok: false,
            error:
              "productId inválido."
          });
      }

      const result =
  await pool.query(
    `
      SELECT
        id,
        store_id,
        product_id,
        nome,
        current_quantity,
        target_quantity,
        created_at,
        reopened,
        reopened_at,

        CASE
          WHEN reopened = TRUE
               AND reopened_at IS NOT NULL
          THEN reopened_at + INTERVAL '24 hours'
          ELSE created_at + INTERVAL '72 hours'
        END AS end_at

FROM lotes

            WHERE
              product_id = $1
              AND active = TRUE

            ORDER BY
              updated_at DESC

            LIMIT 1
          `,
          [
            productId
          ]
        );

      if (
        result.rows.length === 0
      ) {

        return res
          .status(404)
          .json({
            ok: false,
            error:
              "Lote não configurado.",
            productId
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
          Number(
            lote.store_id
          ),

        productId:
          Number(
            lote.product_id
          ),

        name:
          lote.nome,

        current,

        target,

        remaining,

        percentage,

        closed:
  current >= target,

endAt:
  lote.end_at
      });

    } catch (error) {

      return res
        .status(500)
        .json({
          ok: false,
          error:
            error.message
        });
    }
  }
);/*
|--------------------------------------------------------------------------
| API LOTE - COMPATIBILIDADE
|--------------------------------------------------------------------------
|
| Mantemos /api/lote funcionando para o frontend antigo.
|
| Enquanto não alteramos o store.js.tpl, essa rota devolve
| o lote atualizado mais recentemente.
|--------------------------------------------------------------------------
*/

app.get(
  "/api/lote",
  async (req, res) => {

    try {

      res.setHeader(
        "Cache-Control",
        "no-store, no-cache, must-revalidate, proxy-revalidate"
      );

      res.setHeader(
        "Pragma",
        "no-cache"
      );

      res.setHeader(
        "Expires",
        "0"
      );

      const store =
        await buscarUltimaLoja();

      if (!store) {

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
          store.store_id
        );

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
              store_id = $1
              AND active = TRUE

            ORDER BY
              updated_at DESC

            LIMIT 1
          `,
          [
            storeId
          ]
        );

      if (
        result.rows.length === 0
      ) {

        return res
          .status(404)
          .json({
            ok: false,
            error:
              "Nenhum lote configurado."
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
          Number(
            lote.store_id
          ),

        productId:
          Number(
            lote.product_id
          ),

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
        "Erro lote compatibilidade:",
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
| REPROCESSAR PEDIDO
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

      const store =
        await buscarUltimaLoja();

      if (!store) {

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
          store.store_id
        );

      const result =
        await processarPedido(
          storeId,
          orderId
        );

      return res.json({
        ok: true,
        storeId,
        orderId,
        result
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
| CONFIGURAR WEBHOOKS MANUALMENTE
|--------------------------------------------------------------------------
*/

app.get(
  "/api/setup-webhooks",
  async (req, res) => {

    try {

      const store =
        await buscarUltimaLoja();

      if (!store) {

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
          store.store_id
        );

      const webhooks =
        await configurarWebhooks(
          storeId,
          store.access_token
        );

      return res.json({
        ok: true,
        storeId,
        webhooks
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
| STATUS
|--------------------------------------------------------------------------
*/

app.get(
  "/api/status",
  async (req, res) => {

    try {

      const store =
        await buscarUltimaLoja();

      const lotes =
        await pool.query(`
          SELECT COUNT(*)::INTEGER AS total
          FROM lotes
          WHERE active = TRUE
        `);

      return res.json({
        ok: true,

        nuvemshopConnected:
          Boolean(store),

        storeId:
          store
            ? Number(store.store_id)
            : null,

        multiProduct:
          true,

        targetDefault:
          DEFAULT_TARGET,

        activeProducts:
          Number(
            lotes.rows[0]?.total || 0
          ),

        cors:
          true
      });

    } catch (error) {

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
      `STAGE 72 multi-produto rodando na porta ${PORT}`
    );

    try {

      await prepararBanco();

      /*
      Se já existe uma loja autorizada,
      sincroniza os produtos no boot.
      */

      const store =
        await buscarUltimaLoja();

      if (store) {

        try {

          const storeId =
            Number(
              store.store_id
            );

          const products =
            await sincronizarProdutos(
              storeId,
              store.access_token
            );

          console.log(
            `Inicialização: ${products.length} produto(s) sincronizado(s).`
          );

        } catch (error) {

          /*
          O servidor continua online mesmo
          se a Nuvemshop estiver indisponível.
          */

          console.error(
            "Falha na sincronização inicial:",
            error.message
          );
        }
      }

    } catch (error) {

      console.error(
        "Erro na inicialização:",
        error.message
      );
    }
  }
);
