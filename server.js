const express = require('express');
const path = require('path');
const { 
    Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes, 
    PermissionFlagsBits, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder,
    ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder 
} = require('discord.js');

const app = express();
app.use(express.json());

const client = new Client({ intents: [3276799] });

// Banco de dados em memória
let db = {
    produtos: [],
    chavePix: "Não definida",
    painelMsgId: null
};

async function registrarComandos(token, clientId) {
    const commands = [
        new SlashCommandBuilder()
            .setName('painel-vendas')
            .setDescription('Inicia o painel de demonstração de produtos')
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    ].map(c => c.toJSON());

    const rest = new REST({ version: '10' }).setToken(token);
    try {
        await rest.put(Routes.applicationCommands(clientId), { body: commands });
    } catch (e) { console.error(e); }
}

async function iniciarBot(token) {
    client.on('interactionCreate', async (i) => {
        if (!i.guild) return;

        // CRIAÇÃO AUTOMÁTICA DE CARGOS
        let cargoDono = i.guild.roles.cache.find(r => r.name === 'Dono Sirius');
        let cargoVendedor = i.guild.roles.cache.find(r => r.name === 'Vendedor Sirius');
        if (!cargoDono) cargoDono = await i.guild.roles.create({ name: 'Dono Sirius', color: '#ff0000' });
        if (!cargoVendedor) cargoVendedor = await i.guild.roles.create({ name: 'Vendedor Sirius', color: '#00ff6a' });

        // 1. COMANDO PARA POSTAR O PAINEL DE DEMONSTRAÇÃO
        if (i.isChatInputCommand() && i.commandName === 'painel-vendas') {
            const embed = new EmbedBuilder()
                .setTitle("💎 Vitrine de Produtos Sirius")
                .setDescription("Confira nossos produtos abaixo. Clique em **Ver Opções** para selecionar e comprar.")
                .setColor("#00ff6a")
                .setImage(db.produtos[0]?.img || null);

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('ver_opcoes').setLabel('Ver Opções').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('config_geral').setEmoji('⚙️').setStyle(ButtonStyle.Secondary)
            );

            const msg = await i.reply({ embeds: [embed], components: [row], fetchReply: true });
            db.painelMsgId = msg.id;
        }

        // 2. CONFIGURAR (ENGRENAGEM) - CHAVE PIX + PRODUTOS
        if (i.isButton() && i.customId === 'config_geral') {
            if (!i.member.roles.cache.has(cargoDono.id)) return i.reply({ content: "❌ Apenas o **Dono Sirius** pode configurar!", ephemeral: true });

            const modal = new ModalBuilder().setCustomId('m_config_total').setTitle('Configuração Geral da Loja');
            modal.addComponents(
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('pix').setLabel('Sua Chave PIX').setStyle(TextInputStyle.Short).setValue(db.chavePix)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('n').setLabel('Nome do Novo Produto').setStyle(TextInputStyle.Short)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('p').setLabel('Preço (Ex: 9.99)').setStyle(TextInputStyle.Short)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('e').setLabel('Estoque').setStyle(TextInputStyle.Short)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('i').setLabel('URL da Imagem').setStyle(TextInputStyle.Short))
            );
            return await i.showModal(modal);
        }

        // SALVAR E REATUALIZAR PAINEL
        if (i.isModalSubmit() && i.customId === 'm_config_total') {
            db.chavePix = i.fields.getTextInputValue('pix');
            const nome = i.fields.getTextInputValue('n');
            if (nome) {
                db.produtos.push({
                    nome,
                    preco: i.fields.getTextInputValue('p'),
                    estoque: i.fields.getTextInputValue('e'),
                    img: i.fields.getTextInputValue('i')
                });
            }

            // Atualiza a mensagem do painel automaticamente
            const canal = i.channel;
            const msgPainel = await canal.messages.fetch(db.painelMsgId).catch(() => null);
            if (msgPainel) {
                const newEmbed = EmbedBuilder.from(msgPainel.embeds[0]).setImage(db.produtos[db.produtos.length - 1]?.img || null);
                await msgPainel.edit({ embeds: [newEmbed] });
            }

            await i.reply({ content: "✅ Configurações salvas e painel atualizado!", ephemeral: true });
        }

        // 3. VER OPÇÕES - MENU DE SELEÇÃO PARA COMPRA
        if (i.isButton() && i.customId === 'ver_opcoes') {
            if (db.produtos.length === 0) return i.reply({ content: "❌ Nenhum produto cadastrado ainda.", ephemeral: true });

            const menuRow = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('comprar_produto')
                    .setPlaceholder('Selecione o produto para comprar')
                    .addOptions(db.produtos.map(p => ({ label: p.nome, description: `R$ ${p.preco} | Estoque: ${p.estoque}`, value: p.nome })))
            );

            await i.reply({ content: "Escolha um item da lista:", components: [menuRow], ephemeral: true });
        }

        // 4. SELECIONOU PRODUTO -> CRIA CARRINHO
        if (i.isStringSelectMenu() && i.customId === 'comprar_produto') {
            const prod = db.produtos.find(p => p.nome === i.values[0]);
            const canal = await i.guild.channels.create({
                name: `🛒-${i.user.username}`,
                type: ChannelType.GuildText,
                permissionOverwrites: [
                    { id: i.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
                    { id: i.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
                    { id: cargoVendedor.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
                    { id: cargoDono.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }
                ]
            });

            const embedCarrinho = new EmbedBuilder()
                .setTitle("🛒 Revisão da Compra")
                .setDescription(`**Produto:** ${prod.nome}\n**Valor:** R$ ${prod.preco}\n**Estoque:** ${prod.estoque}`)
                .setColor("#5865F2").setImage(prod.img);

            const rowCheck = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`checkout_${prod.preco}`).setLabel('Ir para o Pagamento').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('cancelar').setLabel('Cancelar').setStyle(ButtonStyle.Danger)
            );

            await canal.send({ content: `${i.user} | Equipe: <@&${cargoVendedor.id}>`, embeds: [embedCarrinho], components: [rowCheck] });
            await i.update({ content: `✅ Canal criado: ${canal}`, components: [] });
        }

        // 5. PIX + TIMER 10 MIN
        if (i.isButton() && i.customId.startsWith('checkout_')) {
            const valor = i.customId.split('_')[1];
            const pixEmb = new EmbedBuilder()
                .setTitle("Pagamento via PIX")
                .setDescription(`Valor: **R$ ${valor}**\n\n**Chave Copia e Cola:**\n\`${db.chavePix}\`\n\n⌛ Expira em 10 minutos.`)
                .setColor("#00ff6a");

            const rowVendedor = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('pago').setLabel('Confirmar Pagamento').setStyle(ButtonStyle.Primary)
            );

            await i.update({ embeds: [pixEmb], components: [rowVendedor] });

            setTimeout(async () => {
                const c = await i.guild.channels.fetch(i.channelId).catch(() => null);
                if (c) {
                    await c.send("⏰ Tempo esgotado! Carrinho fechando...");
                    setTimeout(() => c.delete().catch(() => {}), 5000);
                }
            }, 600000);
        }

        // 6. CONFIRMAÇÃO
        if (i.isButton() && i.customId === 'pago') {
            const isStaff = i.member.roles.cache.has(cargoVendedor.id) || i.member.roles.cache.has(cargoDono.id);
            if (!isStaff) return i.reply({ content: "❌ Apenas a equipe pode confirmar!", ephemeral: true });
            await i.reply("💎 **Pagamento Confirmado!**");
        }

        if (i.isButton() && i.customId === 'cancelar') await i.channel.delete().catch(() => {});
    });

    await client.login(token);
    await registrarComandos(token, client.user.id);
}

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.post('/ligar-bot', async (req, res) => {
    try { await iniciarBot(req.body.token); res.send({ msg: "OK" }); } 
    catch (e) { res.send({ msg: "ERRO" }); }
});
app.listen(process.env.PORT || 3000, '0.0.0.0');
