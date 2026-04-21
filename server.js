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
    painel: { titulo: "Vitrine de Produtos Sirius", desc: "Confira nossos itens abaixo", img: null },
    produtos: [], // Produtos cadastrados via engrenagem
    chavePix: "Não definida",
    msgPainelId: null
};

async function registrarComandos(token, clientId) {
    const commands = [
        new SlashCommandBuilder()
            .setName('painel-vendas')
            .setDescription('Posta o painel de vitrine')
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    ].map(c => c.toJSON());

    const rest = new REST({ version: '10' }).setToken(token);
    try { await rest.put(Routes.applicationCommands(clientId), { body: commands }); } catch (e) {}
}

async function iniciarBot(token) {
    client.on('interactionCreate', async (i) => {
        if (!i.guild) return;

        // Criar cargos se não existirem
        let cargoDono = i.guild.roles.cache.find(r => r.name === 'Dono Sirius');
        let cargoVend = i.guild.roles.cache.find(r => r.name === 'Vendedor Sirius');
        if (!cargoDono) cargoDono = await i.guild.roles.create({ name: 'Dono Sirius', color: '#ff0000' });
        if (!cargoVend) cargoVend = await i.guild.roles.create({ name: 'Vendedor Sirius', color: '#00ff6a' });

        // 1. POSTAR PAINEL VITRINE
        if (i.isChatInputCommand() && i.commandName === 'painel-vendas') {
            const embed = new EmbedBuilder()
                .setTitle(db.painel.titulo).setDescription(db.painel.desc).setColor("#00ff6a").setImage(db.painel.img);

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('ver_opcoes').setLabel('Ver Opções').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('config_engrenagem').setEmoji('⚙️').setStyle(ButtonStyle.Secondary)
            );

            const msg = await i.reply({ embeds: [embed], components: [row], fetchReply: true });
            db.msgPainelId = msg.id;
        }

        // 2. CONFIGURAR (ENGRENAGEM)
        if (i.isButton() && i.customId === 'config_engrenagem') {
            if (!i.member.roles.cache.has(cargoDono.id)) return i.reply({ content: "❌ Apenas o **Dono Sirius** configura!", ephemeral: true });

            const modal = new ModalBuilder().setCustomId('m_config_master').setTitle('Configuração Sirius');
            modal.addComponents(
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('p_titulo').setLabel('Título do Painel').setStyle(TextInputStyle.Short).setValue(db.painel.titulo)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('p_img').setLabel('Banner do Painel (URL)').setStyle(TextInputStyle.Short).setValue(db.painel.img || "")),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('prod_nome').setLabel('Nome do Novo Produto').setStyle(TextInputStyle.Short).setRequired(false)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('prod_preco').setLabel('Preço (Ex: 9.99)').setStyle(TextInputStyle.Short).setRequired(false)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('pix').setLabel('Sua Chave PIX').setStyle(TextInputStyle.Short).setValue(db.chavePix))
            );
            return await i.showModal(modal);
        }

        // SALVAR CONFIGS E ATUALIZAR VITRINE
        if (i.isModalSubmit() && i.customId === 'm_config_master') {
            db.painel.titulo = i.fields.getTextInputValue('p_titulo');
            db.painel.img = i.fields.getTextInputValue('p_img');
            db.chavePix = i.fields.getTextInputValue('pix');

            const n = i.fields.getTextInputValue('prod_nome');
            if (n) db.produtos.push({ nome: n, preco: i.fields.getTextInputValue('prod_preco'), estoque: "Disponível" });

            const msg = await i.channel.messages.fetch(db.msgPainelId).catch(() => null);
            if (msg) {
                const upEmbed = new EmbedBuilder().setTitle(db.painel.titulo).setDescription(db.painel.desc).setImage(db.painel.img).setColor("#00ff6a");
                await msg.edit({ embeds: [upEmbed] });
            }
            await i.reply({ content: "✅ Painel atualizado e produto adicionado!", ephemeral: true });
        }

        // 3. VER OPÇÕES (MOSTRA OS PRODUTOS)
        if (i.isButton() && i.customId === 'ver_opcoes') {
            if (db.produtos.length === 0) return i.reply({ content: "❌ Sem produtos!", ephemeral: true });

            const menu = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder().setCustomId('comprar_item').setPlaceholder('Clique aqui para ver as opções')
                    .addOptions(db.produtos.map(p => ({ label: p.nome, description: `Valor: R$ ${p.preco}`, value: p.nome })))
            );
            await i.reply({ content: "Selecione o produto desejado:", components: [menu], ephemeral: true });
        }

        // 4. CRIA TICKET SEM LOGO (SÓ REVISÃO)
        if (i.isStringSelectMenu() && i.customId === 'comprar_item') {
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

            const revisao = new EmbedBuilder()
                .setTitle("Revisão do Pedido")
                .setDescription(`**Produto:** ${prod.nome}\n**Valor à vista:** R$ ${prod.preco}\n**Estoque:** ${prod.estoque}`)
                .setColor("#5865F2"); // Sem imagem/logo conforme pedido

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`pix_${prod.preco}`).setLabel('Ir para o Pagamento').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('del_ticket').setLabel('Cancelar').setStyle(ButtonStyle.Danger)
            );

            await canal.send({ content: `${i.user} | Equipe Sirius`, embeds: [revisao], components: [row] });
            await i.update({ content: `✅ Ticket criado: ${canal}`, components: [] });
        }

        // 5. PIX + TIMER 10 MIN
        if (i.isButton() && i.customId.startsWith('pix_')) {
            const val = i.customId.split('_')[1];
            const pixEmb = new EmbedBuilder()
                .setTitle("Pagamento").setDescription(`Pague **R$ ${val}** na chave:\n\`${db.chavePix}\`\n\n⌛ 10 min para confirmar.`).setColor("#00ff6a");

            const btn = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('confirmar').setLabel('Confirmar Pago').setStyle(ButtonStyle.Primary));

            await i.update({ embeds: [pixEmb], components: [btn] });
            setTimeout(async () => {
                const c = await i.guild.channels.fetch(i.channelId).catch(() => null);
                if (c) { await c.send("⏰ Tempo esgotado!"); setTimeout(() => c.delete().catch(() => {}), 5000); }
            }, 600000);
        }

        if (i.isButton() && i.customId === 'confirmar') {
            if (!i.member.roles.cache.has(cargoVend.id) && !i.member.roles.cache.has(cargoDono.id)) return i.reply({ content: "❌ Sem permissão!", ephemeral: true });
            await i.reply("✅ **Pagamento Confirmado!**");
        }
        if (i.isButton() && i.customId === 'del_ticket') await i.channel.delete().catch(() => {});
    });

    await client.login(token);
    await registrarComandos(token, client.user.id);
}

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.post('/ligar-bot', async (req, res) => {
    try { await iniciarBot(req.body.token); res.send({ msg: "OK" }); } catch (e) { res.send({ msg: "ERRO" }); }
});
app.listen(process.env.PORT || 3000, '0.0.0.0');
