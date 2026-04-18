const express = require('express');
const { 
    Client, GatewayIntentBits, ActionRowBuilder, EmbedBuilder, StringSelectMenuBuilder, 
    SlashCommandBuilder, REST, Routes, PermissionFlagsBits, ChannelType, ButtonBuilder, 
    ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle 
} = require('discord.js');

const app = express();
app.use(express.json());

// Banco de dados temporário
let db = {
    config: {
        nome: "Sua Loja",
        pix: "Não configurado",
        banner: "https://i.imgur.com/vWb6XyS.png",
        msgVendas: "📌 Escolha sua conta abaixo.",
        siglas: "Configurar siglas no /gerenciar",
        msgTicket: "Olá! Realize o pagamento para receber seu produto."
    },
    estoque: [] 
};

const client = new Client({ intents: [3276799] });

async function iniciarBot(token) {
    client.on('ready', async () => {
        const commands = [
            new SlashCommandBuilder().setName('vendas').setDescription('Postar painel de vendas'),
            new SlashCommandBuilder().setName('gerenciar').setDescription('Painel de controle')
        ].map(c => c.toJSON());
        const rest = new REST({ version: '10' }).setToken(token);
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log(`✅ Bot ${client.user.tag} Online no Railway!`);
    });

    client.on('interactionCreate', async (i) => {
        if (i.commandName === 'vendas') {
            const embed = new EmbedBuilder()
                .setTitle(`⭐ ${db.config.nome}`)
                .setImage(db.config.banner)
                .setColor("#2b2d31")
                .setDescription(`${db.config.msgVendas}\n\n**Siglas:**\n${db.config.siglas}`);
            const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('ver_opc').setLabel('🛒 Ver Opções').setStyle(ButtonStyle.Success));
            return i.reply({ embeds: [embed], components: [row] });
        }

        if (i.commandName === 'gerenciar') {
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('g_msgs').setLabel('Mensagens').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('g_add').setLabel('Add Produto + Descrição').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('g_loja').setLabel('Config Loja/PIX').setStyle(ButtonStyle.Secondary)
            );
            return i.reply({ content: "🛠️ **Painel ADM Sirius**", components: [row], ephemeral: true });
        }

        if (i.isButton()) {
            if (i.customId === 'ver_opc') {
                if (db.estoque.length === 0) return i.reply({ content: "❌ Estoque vazio!", ephemeral: true });
                const menu = new ActionRowBuilder().addComponents(
                    new StringSelectMenuBuilder().setCustomId('compra').setPlaceholder('🛒 Selecione um produto...')
                    .addOptions(db.estoque.map((e, idx) => ({ label: e.nome, description: `R$ ${e.preco} | Clique para ver detalhes`, value: `p_${idx}` })))
                );
                return i.reply({ content: "Selecione o que deseja comprar:", components: [menu], ephemeral: true });
            }
            if (i.customId === 'g_msgs') {
                const modal = new ModalBuilder().setCustomId('m_m').setTitle('Configurar Textos');
                modal.addComponents(
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('mv').setLabel("Painel Principal").setStyle(TextInputStyle.Paragraph).setValue(db.config.msgVendas)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('ms').setLabel("Siglas da Loja").setStyle(TextInputStyle.Paragraph).setValue(db.config.siglas)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('mt').setLabel("Mensagem do Ticket").setStyle(TextInputStyle.Paragraph).setValue(db.config.msgTicket))
                );
                return i.showModal(modal);
            }
            if (i.customId === 'g_add') {
                const modal = new ModalBuilder().setCustomId('m_a').setTitle('Novo Produto Detalhado');
                modal.addComponents(
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('n').setLabel("Nome do Produto").setStyle(TextInputStyle.Short)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('p').setLabel("Preço").setStyle(TextInputStyle.Short)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('q').setLabel("Estoque").setStyle(TextInputStyle.Short)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('d').setLabel("Descrição do Produto").setStyle(TextInputStyle.Paragraph))
                );
                return i.showModal(modal);
            }
            if (i.customId === 'g_loja') {
                const modal = new ModalBuilder().setCustomId('m_l').setTitle('Dados da Loja');
                modal.addComponents(
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('n').setLabel("Nome da Loja").setStyle(TextInputStyle.Short).setValue(db.config.nome)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('p').setLabel("Chave PIX").setStyle(TextInputStyle.Short).setValue(db.config.pix)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('b').setLabel("URL do Banner").setStyle(TextInputStyle.Short).setValue(db.config.banner))
                );
                return i.showModal(modal);
            }
            if (i.customId === 'fechar') return i.channel.delete();
        }

        if (i.isModalSubmit()) {
            if (i.custom
