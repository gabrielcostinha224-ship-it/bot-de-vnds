const express = require('express');
const path = require('path');
const { 
    Client, GatewayIntentBits, ActionRowBuilder, EmbedBuilder, StringSelectMenuBuilder, 
    SlashCommandBuilder, REST, Routes, PermissionFlagsBits, ChannelType, ButtonBuilder, 
    ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle 
} = require('discord.js');

const app = express();
app.use(express.json());

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
        try {
            const commands = [
                new SlashCommandBuilder().setName('vendas').setDescription('Postar painel de vendas'),
                new SlashCommandBuilder().setName('gerenciar').setDescription('Painel de controle')
            ].map(c => c.toJSON());
            const rest = new REST({ version: '10' }).setToken(token);
            await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
            console.log(`✅ Bot ${client.user.tag} Online!`);
        } catch (e) { console.error("Erro nos comandos:", e); }
    });

    client.on('interactionCreate', async (i) => {
        if (i.commandName === 'vendas') {
            const embed = new EmbedBuilder().setTitle(`⭐ ${db.config.nome}`).setImage(db.config.banner).setColor("#2b2d31").setDescription(`${db.config.msgVendas}\n\n**Siglas:**\n${db.config.siglas}`);
            const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('ver_opc').setLabel('🛒 Ver Opções').setStyle(ButtonStyle.Success));
            return i.reply({ embeds: [embed], components: [row] });
        }

        if (i.commandName === 'gerenciar') {
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('g_msgs').setLabel('Mensagens').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('g_add').setLabel('Add Produto').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('g_loja').setLabel('Config Loja').setStyle(ButtonStyle.Secondary)
            );
            return i.reply({ content: "🛠️ **Painel ADM Sirius**", components: [row], ephemeral: true });
        }

        if (i.isButton()) {
            if (i.customId === 'ver_opc') {
                if (db.estoque.length === 0) return i.reply({ content: "❌ Estoque vazio!", ephemeral: true });
                const menu = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('compra').setPlaceholder('🛒 Selecione um produto...').addOptions(db.estoque.map((e, idx) => ({ label: e.nome, description: `R$ ${e.preco}`, value: `p_${idx}` }))));
                return i.reply({ content: "Escolha o que deseja comprar:", components: [menu], ephemeral: true });
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
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('p').setLabel("Preço (Só números)").setStyle(TextInputStyle.Short)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('q').setLabel("Quantidade em Estoque").setStyle(TextInputStyle.Short)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('d').setLabel("Descrição/O que vem na conta?").setStyle(TextInputStyle.Paragraph))
                );
                return i.showModal(modal);
            }
            if (i.customId === 'g_loja') {
                const modal = new ModalBuilder().setCustomId('m_l').setTitle('Configurar Loja');
                modal.addComponents(
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('n').setLabel("Nome da Loja").setStyle(TextInputStyle.Short).setValue(db.config.nome)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('p').setLabel("Chave PIX").setStyle(TextInputStyle.Short).setValue(db.config.pix)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('b').setLabel("Link do Banner").setStyle(TextInputStyle.Short).setValue(db.config.banner))
                );
                return i.showModal(modal);
            }
            if (i.customId === 'fechar') return i.channel.delete().catch(() => {});
        }

        if (i.isModalSubmit()) {
            if (i.customId === 'm_m') {
                db.config.msgVendas = i.fields.getTextInputValue('mv');
                db.config.siglas = i.fields.getTextInputValue('ms');
                db.config.msgTicket = i.fields.getTextInputValue('mt');
                return i.reply({ content: "✅ Mensagens atualizadas!", ephemeral: true });
            }
            if (i.customId === 'm_a') {
                db.estoque.push({ 
                    nome: i.fields.getTextInputValue('n'), 
                    preco: i.fields.getTextInputValue('p'), 
                    qtd: i.fields.getTextInputValue('q'),
                    desc: i.fields.getTextInputValue('d')
                });
                return i.reply({ content: "✅ Produto adicionado com sucesso!", ephemeral: true });
            }
            if (i.customId === 'm_l') {
                db.config.nome = i.fields.getTextInputValue('n');
                db.config.pix = i.fields.getTextInputValue('p');
                db.config.banner = i.fields.getTextInputValue('b');
                return i.reply({ content: "✅ Dados da loja salvos!", ephemeral: true });
            }
        }

        if (i.isStringSelectMenu() && i.customId === 'compra') {
            await i.deferReply({ ephemeral: true });
            const item = db.estoque[i.values[0].split('_')[1]];
            const canal = await i.guild.channels.create({
                name: `🛒-${i.user.username}`,
                type: ChannelType.GuildText,
                permissionOverwrites: [
                    { id: i.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
                    { id: i.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }
                ]
            });
            const embedTicket = new EmbedBuilder()
                .setTitle("🛒 Detalhes do seu Pedido")
                .setColor("#00ff6a")
                .setDescription(`📦 **Produto:** \`${item.nome}\`\n💰 **Preço:** \`R$ ${item.preco}\`\n📝 **Descrição:**\n${item.desc}\n\n🔑 **Chave PIX:** \`${db.config.pix}\`\n\n${db.config.msgTicket}`);
            
            const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('fechar').setLabel('Fechar Ticket').setStyle(ButtonStyle.Danger));
            await canal.send({ content: `${i.user}`, embeds: [embedTicket], components: [row] });
            return i.editReply({ content: `✅ Seu ticket foi aberto aqui: ${canal}` });
        }
    });
    await client.login(token);
}

// MOSTRAR O PAINEL BONITO NA PÁGINA INICIAL
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.post('/ligar-bot', async (req, res) => {
    const { token, nomeLoja, pix, banner } = req.body;
    db.config.nome = nomeLoja || db.config.nome;
    db.config.pix = pix || db.config.pix;
    db.config.banner = banner || db.config.banner;
    await iniciarBot(token);
    res.send({ msg: "OK" });
});

const port = process.env.PORT || 3000;
app.listen(port, '0.0.0.0', () => console.log(`🚀 Sirius Maker rodando na porta ${port}`));
