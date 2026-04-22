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
            .setDescription('Envia o painel profissional de vendas')
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

        // 1. COMANDO PARA ENVIAR O PAINEL
        if (i.isChatInputCommand() && i.commandName === 'painel-vendas') {
            const embed = new EmbedBuilder()
                .setTitle(db.painel.nome)
                .setDescription(db.painel.desc)
                .setColor("#00ff6a")
                .setImage(db.painel.banner);

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('ver_opcoes').setLabel('Comprar Produto').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('config_painel').setLabel('Configurar Loja').setEmoji('⚙️').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('add_produto').setLabel('Add Produto').setEmoji('📦').setStyle(ButtonStyle.Primary)
            );

            const msg = await i.reply({ embeds: [embed], components: [row], fetchReply: true });
            db.msgPainelId = msg.id;
        }

        // 2. MODAL: CONFIGURAÇÃO DA LOJA (NOME, DESCRIÇÃO, URL)
        if (i.isButton() && i.customId === 'config_painel') {
            if (!i.member.roles.cache.has(cargoDono.id)) return i.reply({ content: "❌ Acesso negado.", ephemeral: true });

            const modal = new ModalBuilder().setCustomId('m_loja').setTitle('Configurar Vitrine');
            modal.addComponents(
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('l_nome').setLabel('NOME DA LOJA').setStyle(TextInputStyle.Short).setValue(db.painel.nome)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('l_desc').setLabel('DESCREVER PRODUTO (PAINEL)').setStyle(TextInputStyle.Paragraph).setValue(db.painel.desc)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('l_url').setLabel('URL DO BANNER').setStyle(TextInputStyle.Short).setValue(db.painel.banner || ""))
            );
            return await i.showModal(modal);
        }

        // 3. MODAL: ADICIONAR PRODUTO (NOME, VALOR, PIX)
        if (i.isButton() && i.customId === 'add_produto') {
            if (!i.member.roles.cache.has(cargoDono.id)) return i.reply({ content: "❌ Acesso negado.", ephemeral: true });

            const modal = new ModalBuilder().setCustomId('m_produto').setTitle('Adicionar Novo Produto');
            modal.addComponents(
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('p_nome').setLabel('NOME DO PRODUTO').setStyle(TextInputStyle.Short)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('p_valor').setLabel('VALOR DO PRODUTO').setStyle(TextInputStyle.Short)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('p_pix').setLabel('CHAVE PIX PARA ESTE PRODUTO').setStyle(TextInputStyle.Short).setValue(db.chavePix))
            );
            return await i.showModal(modal);
        }

        // PROCESSAR ATUALIZAÇÃO DA LOJA
        if (i.isModalSubmit() && i.customId === 'm_loja') {
            db.painel.nome = i.fields.getTextInputValue('l_nome');
            db.painel.desc = i.fields.getTextInputValue('l_desc');
            db.painel.banner = i.fields.getTextInputValue('l_url');

            const msg = await i.channel.messages.fetch(db.msgPainelId).catch(() => null);
            if (msg) {
                const up = new EmbedBuilder().setTitle(db.painel.nome).setDescription(db.painel.desc).setImage(db.painel.banner).setColor("#00ff6a");
                await msg.edit({ embeds: [up] });
            }
            await i.reply({ content: "✅ Vitrine atualizada!", ephemeral: true });
        }

        // PROCESSAR ADIÇÃO DE PRODUTO
        if (i.isModalSubmit() && i.customId === 'm_produto') {
            const nome = i.fields.getTextInputValue('p_nome');
            const valor = i.fields.getTextInputValue('p_valor');
            const pix = i.fields.getTextInputValue('p_pix');

            db.produtos.push({ nome, valor, pix });
            db.chavePix = pix; // Atualiza a chave padrão

            await i.reply({ content: `✅ Produto **${nome}** adicionado!`, ephemeral: true });
        }

        // 4. MENU DE COMPRAS
        if (i.isButton() && i.customId === 'ver_opcoes') {
            if (db.produtos.length === 0) return i.reply({ content: "❌ Não há produtos no estoque.", ephemeral: true });
            
            const menu = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder().setCustomId('selecionar_compra').setPlaceholder('Selecione o que deseja comprar')
                    .addOptions(db.produtos.map((p, index) => ({
                        label: p.nome,
                        description: `Preço: ${p.valor}`,
                        value: index.toString()
                    })))
            );
            await i.reply({ content: "Escolha um item da lista:", components: [menu], ephemeral: true });
        }

        // 5. CRIAÇÃO DE TICKET PROFISSIONAL
        if (i.isStringSelectMenu() && i.customId === 'selecionar_compra') {
            const prod = db.produtos[parseInt(i.values[0])];
            const canal = await i.guild.channels.create({
                name: `🛒-${i.user.username}`,
                type: ChannelType.GuildText,
                permissionOverwrites: [
                    { id: i.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
                    { id: i.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
                    { id: cargoVend.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }
                ]
            });

            const embed = new EmbedBuilder()
                .setTitle("🛒 Revisão do Pedido")
                .setDescription(`**Produto Selecionado:** ${prod.nome}\n**Valor Total:** ${prod.valor}\n\nClique no botão abaixo para gerar os dados de pagamento.`)
                .setColor("#5865F2")
                .setTimestamp();

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`pagar_${i.values[0]}`).setLabel('Gerar Pagamento').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('fechar_ticket').setLabel('Cancelar').setStyle(ButtonStyle.Danger)
            );

            await canal.send({ content: `${i.user} | Suporte Sirius`, embeds: [embed], components: [row] });
            await i.update({ content: `✅ Ticket aberto em: ${canal}`, components: [] });
        }

        // 6. LOGICA DE PAGAMENTO DENTRO DO TICKET
        if (i.isButton() && i.customId.startsWith('pagar_')) {
            const idx = parseInt(i.customId.split('_')[1]);
            const prod = db.produtos[idx];

            const embedPix = new EmbedBuilder()
                .setTitle("💠 Pagamento via PIX")
                .setDescription(`Para concluir sua compra de **${prod.nome}**, realize o pagamento:\n\n**Valor:** ${prod.valor}\n**Chave PIX:**\n\`${prod.pix}\`\n\nEnvie o comprovante abaixo.`)
                .setColor("#00ff6a");

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('confirmar_pagamento').setLabel('Já realizei o pagamento').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('fechar_ticket').setLabel('Fechar Ticket').setStyle(ButtonStyle.Danger)
            );

            await i.update({ embeds: [embedPix], components: [row] });
        }

        if (i.isButton() && i.customId === 'confirmar_pagamento') {
            await i.reply({ content: "📢 **Aviso:** O vendedor foi notificado. Por favor, anexe o comprovante aqui no chat." });
        }

        if (i.isButton() && i.customId === 'fechar_ticket') {
            await i.channel.delete().catch(() => {});
        }
    });

    await client.login(token);
    await registrarComandos(token, client.user.id);
}

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.post('/ligar-bot', async (req, res) => {
    try { await iniciarBot(req.body.token); res.send({ msg: "OK" }); } catch (e) { res.send({ msg: "ERRO" }); }
});
app.listen(process.env.PORT || 3000, '0.0.0.0');
