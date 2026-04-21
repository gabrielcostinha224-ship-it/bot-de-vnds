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
            .setDescription('Envia o painel da loja')
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

        // 1. ENVIAR PAINEL VITRINE
        if (i.isChatInputCommand() && i.commandName === 'painel-vendas') {
            const embed = new EmbedBuilder()
                .setTitle(db.painel.nome)
                .setDescription(db.painel.desc)
                .setColor("#00ff6a")
                .setImage(db.painel.banner);

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('ver_opcoes').setLabel('Ver Opções').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('configurar_loja').setEmoji('⚙️').setStyle(ButtonStyle.Secondary)
            );

            const msg = await i.reply({ embeds: [embed], components: [row], fetchReply: true });
            db.msgPainelId = msg.id;
        }

        // 2. CONFIGURAR (PAINEL + PRODUTOS + PIX)
        if (i.isButton() && i.customId === 'configurar_loja') {
            if (!i.member.roles.cache.has(cargoDono.id)) return i.reply({ content: "❌ Acesso negado.", ephemeral: true });

            const modal = new ModalBuilder().setCustomId('m_setup').setTitle('Configuração Sirius');
            modal.addComponents(
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('loja_nome').setLabel('Nome da Loja').setStyle(TextInputStyle.Short).setValue(db.painel.nome)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('loja_desc').setLabel('Descrição (Substitui o Painel)').setStyle(TextInputStyle.Paragraph).setValue(db.painel.desc)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('loja_banner').setLabel('URL do Banner').setStyle(TextInputStyle.Short).setValue(db.painel.banner || "")),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('p_nome').setLabel('Nome do Produto').setStyle(TextInputStyle.Short).setRequired(false)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('p_qtd').setLabel('Quantidade do Produto').setStyle(TextInputStyle.Short).setRequired(false))
            );
            return await i.showModal(modal);
        }

        if (i.isModalSubmit() && i.customId === 'm_setup') {
            db.painel.nome = i.fields.getTextInputValue('loja_nome');
            db.painel.desc = i.fields.getTextInputValue('loja_desc');
            db.painel.banner = i.fields.getTextInputValue('loja_banner');
            
            const pNome = i.fields.getTextInputValue('p_nome');
            const pQtd = i.fields.getTextInputValue('p_qtd');
            if (pNome) db.produtos.push({ nome: pNome, qtd: pQtd || "Disponível" });

            const msg = await i.channel.messages.fetch(db.msgPainelId).catch(() => null);
            if (msg) {
                const up = new EmbedBuilder().setTitle(db.painel.nome).setDescription(db.painel.desc).setImage(db.painel.banner).setColor("#00ff6a");
                await msg.edit({ embeds: [up] });
            }
            await i.reply({ content: "✅ Configurações salvas!", ephemeral: true });
        }

        // 3. VER OPÇÕES
        if (i.isButton() && i.customId === 'ver_opcoes') {
            if (db.produtos.length === 0) return i.reply({ content: "❌ Sem produtos.", ephemeral: true });
            const menu = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder().setCustomId('comprar').setPlaceholder('Escolha um item da lista')
                    .addOptions(db.produtos.map(p => ({ label: p.nome, description: `Estoque: ${p.qtd}`, value: p.nome })))
            );
            await i.reply({ content: "Selecione o produto:", components: [menu], ephemeral: true });
        }

        // 4. CRIAR TICKET
        if (i.isStringSelectMenu() && i.customId === 'comprar') {
            const prod = db.produtos.find(p => p.nome === i.values[0]);
            const canal = await i.guild.channels.create({
                name: `🛒-${i.user.username}`,
                type: ChannelType.GuildText,
                permissionOverwrites: [
                    { id: i.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
                    { id: i.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
                    { id: cargoVend.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }
                ]
            });

            const embed = new EmbedBuilder().setTitle("Revisão do Pedido").setDescription(`**Produto:** ${prod.nome}\n**Estoque:** ${prod.qtd}`).setColor("#5865F2");
            const btns = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('ir_pagar').setLabel('Ir para o Pagamento').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('cancelar').setLabel('Cancelar Compra').setStyle(ButtonStyle.Danger)
            );

            await canal.send({ content: `${i.user} | Staff Sirius`, embeds: [embed], components: [btns] });
            await i.update({ content: `✅ Ticket criado: ${canal}`, components: [] });
        }

        // 5. IR PARA O PAGAMENTO
        if (i.isButton() && i.customId === 'ir_pagar') {
            const pixEmbed = new EmbedBuilder()
                .setTitle("Pagamento & Confirmação")
                .setDescription(`Efetue o PIX na chave:\n\n\`${db.chavePix}\`\n\n*Envie o comprovante abaixo e aguarde a entrega.*`)
                .setColor("#00ff6a");

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('confirmar_pago').setLabel('Confirmar Pagamento').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('cancelar').setLabel('Fechar Ticket').setStyle(ButtonStyle.Danger)
            );

            await i.update({ embeds: [pixEmbed], components: [row] });
        }

        // 6. CONFIRMAR (TICKET CONTINUA ABERTO)
        if (i.isButton() && i.customId === 'confirmar_pago') {
            if (!i.member.roles.cache.has(cargoVend.id) && !i.member.roles.cache.has(cargoDono.id)) return i.reply({ content: "❌ Sem permissão.", ephemeral: true });
            
            await i.reply({ content: "✅ **Pagamento Confirmado!**\nO vendedor enviará o produto em breve. Aguarde neste chat." });
        }

        // 7. FECHAR TICKET MANUALMENTE
        if (i.isButton() && i.customId === 'cancelar') {
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
