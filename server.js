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

let db = {
    painel: { nome: "Nome da Loja", desc: "Descrição do Painel", banner: null },
    produtos: [],
    chavePix: "Não definida",
    msgPainelId: null
};

async function registrarComandos(token, clientId) {
    const commands = [
        new SlashCommandBuilder()
            .setName('painel-vendas')
            .setDescription('Envia o painel de vendas')
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    ].map(c => c.toJSON());

    const rest = new REST({ version: '10' }).setToken(token);
    try { await rest.put(Routes.applicationCommands(clientId), { body: commands }); } catch (e) {}
}

async function iniciarBot(token) {
    client.on('interactionCreate', async (i) => {
        if (!i.guild) return;

        let cargoDono = i.guild.roles.cache.find(r => r.name === 'Dono Sirius');
        let cargoVend = i.guild.roles.cache.find(r => r.name === 'Vendedor Sirius');
        if (!cargoDono) cargoDono = await i.guild.roles.create({ name: 'Dono Sirius', color: '#ff0000' });
        if (!cargoVend) cargoVend = await i.guild.roles.create({ name: 'Vendedor Sirius', color: '#00ff6a' });

        // 1. ENVIAR PAINEL
        if (i.isChatInputCommand() && i.commandName === 'painel-vendas') {
            const embed = new EmbedBuilder()
                .setTitle(db.painel.nome)
                .setDescription(db.painel.desc)
                .setColor("#00ff6a")
                .setImage(db.painel.banner);

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('ver_opcoes').setLabel('Comprar').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('config_painel').setLabel('Configurar').setEmoji('⚙️').setStyle(ButtonStyle.Secondary)
            );

            const msg = await i.reply({ embeds: [embed], components: [row], fetchReply: true });
            db.msgPainelId = msg.id;
        }

        // 2. CONFIGURAÇÃO - PARTE 1 (LOJA)
        if (i.isButton() && i.customId === 'config_painel') {
            if (!i.member.roles.cache.has(cargoDono.id)) {
                return i.reply({ content: "❌ Acesso negado. Apenas para **Dono Sirius**.", ephemeral: true });
            }

            const modal1 = new ModalBuilder().setCustomId('m_etapa1').setTitle('Configuração: Vitrine');
            modal1.addComponents(
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('l_nome').setLabel('NOME DA LOJA').setStyle(TextInputStyle.Short).setValue(db.painel.nome)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('l_desc').setLabel('DESCREVER PRODUTO (PAINEL)').setStyle(TextInputStyle.Paragraph).setValue(db.painel.desc)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('l_url').setLabel('URL DO BANNER').setStyle(TextInputStyle.Short).setValue(db.painel.banner || ""))
            );
            return await i.showModal(modal1);
        }

        // SALVAR PARTE 1 E IR PARA PARTE 2 (PRODUTO)
        if (i.isModalSubmit() && i.customId === 'm_etapa1') {
            db.painel.nome = i.fields.getTextInputValue('l_nome');
            db.painel.desc = i.fields.getTextInputValue('l_desc');
            db.painel.banner = i.fields.getTextInputValue('l_url');

            const modal2 = new ModalBuilder().setCustomId('m_etapa2').setTitle('Configuração: Produto');
            modal2.addComponents(
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('p_nome').setLabel('NOME DO PRODUTO').setStyle(TextInputStyle.Short)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('p_valor').setLabel('VALOR DO PRODUTO').setStyle(TextInputStyle.Short)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('p_pix').setLabel('CHAVE PIX').setStyle(TextInputStyle.Short).setValue(db.chavePix))
            );

            // Atualiza o visual do painel agora
            const msg = await i.channel.messages.fetch(db.msgPainelId).catch(() => null);
            if (msg) {
                const up = new EmbedBuilder().setTitle(db.painel.nome).setDescription(db.painel.desc).setImage(db.painel.banner).setColor("#00ff6a");
                await msg.edit({ embeds: [up] });
            }

            return await i.showModal(modal2);
        }

        // SALVAR PARTE 2
        if (i.isModalSubmit() && i.customId === 'm_etapa2') {
            const nome = i.fields.getTextInputValue('p_nome');
            const valor = i.fields.getTextInputValue('p_valor');
            const pix = i.fields.getTextInputValue('p_pix');

            if (nome) {
                db.produtos.push({ nome, valor, pix });
                db.chavePix = pix;
            }

            await i.reply({ content: "✅ Loja e Produto configurados sem misturar nada!", ephemeral: true });
        }

        // 3. MENU DE COMPRAS
        if (i.isButton() && i.customId === 'ver_opcoes') {
            if (db.produtos.length === 0) return i.reply({ content: "❌ Sem estoque.", ephemeral: true });
            const menu = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder().setCustomId('comprar_item').setPlaceholder('Escolha o produto')
                    .addOptions(db.produtos.map((p, index) => ({ label: p.nome, description: `Valor: ${p.valor}`, value: index.toString() })))
            );
            await i.reply({ content: "Selecione:", components: [menu], ephemeral: true });
        }

        // 4. TICKET
        if (i.isStringSelectMenu() && i.customId === 'comprar_item') {
            const prod = db.produtos[parseInt(i.values[0])];
            const canal = await i.guild.channels.create({
                name: `🛒-${i.user.username}`,
                type: ChannelType.GuildText,
                permissionOverwrites: [
                    { id: i.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
                    { id: i.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
                    { id: cargoVend.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
                    { id: cargoDono.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }
                ]
            });

            const embed = new EmbedBuilder().setTitle("Revisão do Pedido").setDescription(`**Produto:** ${prod.nome}\n**Valor:** ${prod.valor}`).setColor("#5865F2");
            const btns = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`pg_${i.values[0]}`).setLabel('Ir para o Pagamento').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('del_t').setLabel('Fechar').setStyle(ButtonStyle.Danger)
            );

            await canal.send({ content: `${i.user}`, embeds: [embed], components: [btns] });
            await i.update({ content: `✅ Ticket: ${canal}`, components: [] });
        }

        // 5. PAGAMENTO
        if (i.isButton() && i.customId.startsWith('pg_')) {
            const idx = parseInt(i.customId.split('_')[1]);
            const prod = db.produtos[idx];
            const embed = new EmbedBuilder().setTitle("💠 Pagamento PIX").setDescription(`Pague **${prod.valor}**\n\nChave:\n\`${prod.pix}\``).setColor("#00ff6a");
            await i.update({ embeds: [embed] });
        }

        if (i.isButton() && i.customId === 'del_t') await i.channel.delete().catch(() => {});
    });

    await client.login(token);
    await registrarComandos(token, client.user.id);
}

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.post('/ligar-bot', async (req, res) => {
    try { await iniciarBot(req.body.token); res.send({ msg: "OK" }); } catch (e) { res.send({ msg: "ERRO" }); }
});
app.listen(process.env.PORT || 3000, '0.0.0.0');
